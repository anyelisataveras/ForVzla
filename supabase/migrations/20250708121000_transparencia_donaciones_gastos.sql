-- Transparencia de donaciones y gastos por grupo (coordinación)

create table if not exists donaciones_grupo (
  id                uuid primary key default gen_random_uuid(),
  grupo             text not null,
  tipo              text not null check (tipo in ('monetaria','comida','ropa','medicinas','higiene','insumos','otro')),
  fecha             date not null default current_date,
  monto             numeric(12,2),
  moneda            text not null default 'USD',
  cantidad          numeric(12,2),
  unidad            text,
  donante_nombre    text,
  donante_contacto  text,
  descripcion       text not null,
  destino           text,
  creado_por        text,
  created_at        timestamptz not null default now()
);

create index if not exists donaciones_grupo_grupo_idx on donaciones_grupo (grupo, created_at desc);
create index if not exists donaciones_grupo_fecha_idx on donaciones_grupo (fecha desc);

alter table donaciones_grupo enable row level security;

drop policy if exists "mod_read_donaciones_grupo" on donaciones_grupo;
drop policy if exists "mod_write_donaciones_grupo" on donaciones_grupo;

create policy "mod_read_donaciones_grupo"
  on donaciones_grupo for select
  using (is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_donaciones_grupo"
  on donaciones_grupo for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

grant select, insert, update, delete on table donaciones_grupo to authenticated;


create table if not exists gastos_grupo (
  id           uuid primary key default gen_random_uuid(),
  grupo        text not null,
  categoria    text not null check (categoria in ('transporte','comida','medicinas','logistica','materiales','servicios','otro')),
  fecha_gasto  date not null,
  monto        numeric(12,2) not null check (monto > 0),
  moneda       text not null default 'USD',
  proveedor    text,
  pagado_por   text,
  descripcion  text not null,
  creado_por   text,
  created_at   timestamptz not null default now()
);

create index if not exists gastos_grupo_grupo_idx on gastos_grupo (grupo, created_at desc);
create index if not exists gastos_grupo_fecha_idx on gastos_grupo (fecha_gasto desc);

alter table gastos_grupo enable row level security;

drop policy if exists "mod_read_gastos_grupo" on gastos_grupo;
drop policy if exists "mod_write_gastos_grupo" on gastos_grupo;

create policy "mod_read_gastos_grupo"
  on gastos_grupo for select
  using (is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_gastos_grupo"
  on gastos_grupo for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

grant select, insert, update, delete on table gastos_grupo to authenticated;

create table if not exists gasto_recibos (
  id           uuid primary key default gen_random_uuid(),
  gasto_id     uuid not null references gastos_grupo(id) on delete cascade,
  grupo        text not null,
  storage_path text not null,
  mime_type    text not null,
  subido_por   text,
  created_at   timestamptz not null default now(),
  constraint gasto_recibos_path_unique unique (storage_path)
);

create index if not exists gasto_recibos_gasto_idx on gasto_recibos (gasto_id, created_at desc);
create index if not exists gasto_recibos_grupo_idx on gasto_recibos (grupo);

create or replace function public.set_gasto_recibos_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select g.grupo into new.grupo
  from gastos_grupo g
  where g.id = new.gasto_id;

  if new.grupo is null then
    raise exception 'Gasto no encontrado';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_gasto_recibos_grupo on gasto_recibos;
create trigger trg_gasto_recibos_grupo
  before insert on gasto_recibos
  for each row execute function set_gasto_recibos_grupo();

alter table gasto_recibos enable row level security;

drop policy if exists "mod_read_gasto_recibos" on gasto_recibos;
drop policy if exists "mod_write_gasto_recibos" on gasto_recibos;

create policy "mod_read_gasto_recibos"
  on gasto_recibos for select
  using (is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_gasto_recibos"
  on gasto_recibos for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

grant select, insert, update, delete on table gasto_recibos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gastos-recibos',
  'gastos-recibos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gastos_recibos_storage_select" on storage.objects;
drop policy if exists "gastos_recibos_storage_insert" on storage.objects;
drop policy if exists "gastos_recibos_storage_delete" on storage.objects;

create policy "gastos_recibos_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'gastos-recibos'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "gastos_recibos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'gastos-recibos'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "gastos_recibos_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'gastos-recibos'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

