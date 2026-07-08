-- Incremental: soportes de donaciones (capturas/comprobantes)

create table if not exists donacion_soportes (
  id           uuid primary key default gen_random_uuid(),
  donacion_id  uuid not null references donaciones_grupo(id) on delete cascade,
  grupo        text not null,
  storage_path text not null,
  mime_type    text not null,
  subido_por   text,
  created_at   timestamptz not null default now(),
  constraint donacion_soportes_path_unique unique (storage_path)
);

create index if not exists donacion_soportes_donacion_idx on donacion_soportes (donacion_id, created_at desc);
create index if not exists donacion_soportes_grupo_idx on donacion_soportes (grupo);

create or replace function public.set_donacion_soportes_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select d.grupo into new.grupo
  from donaciones_grupo d
  where d.id = new.donacion_id;

  if new.grupo is null then
    raise exception 'Donación no encontrada';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_donacion_soportes_grupo on donacion_soportes;
create trigger trg_donacion_soportes_grupo
  before insert on donacion_soportes
  for each row execute function set_donacion_soportes_grupo();

alter table donacion_soportes enable row level security;

drop policy if exists "mod_read_donacion_soportes" on donacion_soportes;
drop policy if exists "mod_write_donacion_soportes" on donacion_soportes;

create policy "mod_read_donacion_soportes"
  on donacion_soportes for select
  using (is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_donacion_soportes"
  on donacion_soportes for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

grant select, insert, update, delete on table donacion_soportes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'donaciones-soportes',
  'donaciones-soportes',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "donaciones_soportes_storage_select" on storage.objects;
drop policy if exists "donaciones_soportes_storage_insert" on storage.objects;
drop policy if exists "donaciones_soportes_storage_delete" on storage.objects;

create policy "donaciones_soportes_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'donaciones-soportes'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "donaciones_soportes_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'donaciones-soportes'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "donaciones_soportes_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'donaciones-soportes'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );
