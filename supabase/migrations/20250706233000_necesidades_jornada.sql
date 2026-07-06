-- Checklist de materiales por jornada + catálogo reutilizable por grupo

create table if not exists items_inventario (
  id          uuid primary key default gen_random_uuid(),
  grupo       text not null,
  nombre      text not null,
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint items_inventario_grupo_nombre_unique unique (grupo, nombre)
);

create index if not exists items_inventario_grupo_idx on items_inventario (grupo, orden);

create table if not exists necesidades_jornada (
  id                  uuid primary key default gen_random_uuid(),
  jornada_id          uuid not null references jornadas(id) on delete cascade,
  item_nombre         text not null,
  descripcion         text,
  cantidad_necesaria  int not null default 1 check (cantidad_necesaria > 0 and cantidad_necesaria <= 9999),
  cantidad_conseguida int not null default 0 check (cantidad_conseguida >= 0 and cantidad_conseguida <= 9999),
  estado              text not null default 'pendiente'
    check (estado in ('pendiente', 'parcial', 'cubierta')),
  donante_notas       text,
  orden               smallint not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists necesidades_jornada_jornada_idx on necesidades_jornada (jornada_id, orden);

alter table items_inventario enable row level security;
alter table necesidades_jornada enable row level security;

drop policy if exists "pub_read_items_inventario" on items_inventario;
drop policy if exists "mod_write_items_inventario" on items_inventario;
drop policy if exists "mod_read_necesidades" on necesidades_jornada;
drop policy if exists "mod_write_necesidades" on necesidades_jornada;

create policy "pub_read_items_inventario"
  on items_inventario for select
  using (activo = true);

create policy "mod_write_items_inventario"
  on items_inventario for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

create policy "mod_read_necesidades"
  on necesidades_jornada for select
  using (exists (
    select 1 from jornadas j
    where j.id = necesidades_jornada.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ));

create policy "mod_write_necesidades"
  on necesidades_jornada for all
  using (exists (
    select 1 from jornadas j
    where j.id = necesidades_jornada.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ))
  with check (exists (
    select 1 from jornadas j
    where j.id = necesidades_jornada.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ));

grant select on table items_inventario to anon, authenticated;
grant insert, update, delete on table items_inventario to authenticated;
grant select, insert, update, delete on table necesidades_jornada to authenticated;

-- Grants faltantes en tablas de jornada (moderadoras escriben vía RLS)
grant insert, update, delete on table inscripciones to authenticated;
grant insert, update, delete on table tareas_jornada to authenticated;

insert into items_inventario (grupo, nombre, orden)
values
  ('cuidadoras_caracas', 'Kits emocionales', 1),
  ('cuidadoras_caracas', 'Pinta caritas / pintura', 2),
  ('cuidadoras_caracas', 'Juguetes', 3),
  ('cuidadoras_caracas', 'Cotillones', 4),
  ('cuidadoras_caracas', 'Agua embotellada', 5),
  ('cuidadoras_caracas', 'Lonches / comida', 6),
  ('cuidadoras_caracas', 'Papel higiénico', 7),
  ('cuidadoras_caracas', 'Material de recreación', 8),
  ('cuidadoras_caracas', 'Primeros auxilios', 9),
  ('cuidadoras_caracas', 'Donación en especie', 10)
on conflict (grupo, nombre) do update set activo = true, orden = excluded.orden;
