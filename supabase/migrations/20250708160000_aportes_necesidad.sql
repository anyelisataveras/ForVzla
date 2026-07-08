-- Progreso público por necesidad: aportes declarados por personas, instituciones o grupos.

create table if not exists aportes_necesidad (
  id               uuid primary key default gen_random_uuid(),
  necesidad_id     uuid not null references necesidades(id) on delete cascade,

  -- Qué se aporta
  tipo_aporte      text not null
    check (tipo_aporte in ('comida','medicinas','agua','refugio','dinero','transporte','voluntariado','insumos','otro')),
  cantidad         numeric(12,2),
  unidad           text,
  descripcion      text,

  -- Quién aporta
  dono_como        text not null
    check (dono_como in ('persona','institucion','grupo')),
  grupo_slug       text,
  donante_nombre   text,
  donante_contacto text,

  -- Estado del aporte (confirmación futura)
  estado           text not null default 'prometido'
    check (estado in ('prometido','confirmado','cancelado')),

  created_at       timestamptz not null default now()
);

create index if not exists aportes_necesidad_necesidad_idx
  on aportes_necesidad (necesidad_id, created_at desc);

alter table aportes_necesidad enable row level security;

drop policy if exists "pub_read_aportes_necesidad" on aportes_necesidad;
drop policy if exists "pub_insert_aportes_necesidad" on aportes_necesidad;

-- Cualquiera puede ver el progreso agregado de las necesidades.
create policy "pub_read_aportes_necesidad"
  on aportes_necesidad for select
  using (true);

-- Cualquiera (anon o autenticado) puede declarar un aporte.
create policy "pub_insert_aportes_necesidad"
  on aportes_necesidad for insert
  with check (true);

grant select, insert on table aportes_necesidad to anon, authenticated;

