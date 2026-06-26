-- ============================================================
-- AYUDA VENEZUELA — Upgrade desde esquema legacy
-- Para BD que ya tiene necesidades + recursos (sin DROP).
-- Ejecutar en Supabase > SQL Editor.
-- ============================================================

-- ── 1) Tablas nuevas ───────────────────────────────────────
create table if not exists edificios_colapsados (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  zona text not null,
  sector text,
  lat double precision not null,
  lng double precision not null,
  estado_edificio text not null default 'colapsado'
    check (estado_edificio in ('colapsado','danos_graves','en_riesgo','evaluando')),
  personas_atrapadas boolean default false,
  rescate_activo boolean default false,
  notas text,
  fuente text,
  created_at timestamptz default now()
);

create table if not exists centros_acopio (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  organizacion text,
  estado_vzla text not null,
  direccion text not null,
  lat double precision not null,
  lng double precision not null,
  telefono text,
  horario text,
  activo boolean default true,
  notas text,
  created_at timestamptz default now()
);

-- ── 2) necesidades: columnas que faltan ──────────────────────
alter table necesidades add column if not exists direccion_exacta text;
alter table necesidades add column if not exists lat double precision;
alter table necesidades add column if not exists lng double precision;
alter table necesidades add column if not exists tipos text[];
alter table necesidades add column if not exists subtipo text;
alter table necesidades add column if not exists cantidad text;
alter table necesidades add column if not exists personas_afectadas int;
alter table necesidades add column if not exists nombre_contacto text;
alter table necesidades add column if not exists telefono text;
alter table necesidades add column if not exists whatsapp text;
alter table necesidades add column if not exists edificio_id uuid;
alter table necesidades add column if not exists fuente text default 'ciudadano';
alter table necesidades add column if not exists source_url text;
alter table necesidades add column if not exists source_hash text;
alter table necesidades add column if not exists confirmaciones int default 1;
alter table necesidades add column if not exists merged_into uuid;

-- Backfill desde columnas legacy (sector, contacto)
update necesidades
set direccion_exacta = coalesce(nullif(trim(sector), ''), zona, 'Sin dirección')
where direccion_exacta is null;

update necesidades
set telefono = coalesce(nullif(trim(contacto), ''), 's/d'),
    nombre_contacto = coalesce(nullif(trim(nombre_contacto), ''), 'Vecino/a')
where telefono is null or nombre_contacto is null;

update necesidades
set tipos = array[tipo]
where tipos is null and tipo is not null;

update necesidades
set fuente = 'ciudadano'
where fuente is null;

update necesidades
set confirmaciones = 1
where confirmaciones is null;

-- NOT NULL donde la app lo requiere
alter table necesidades alter column direccion_exacta set not null;
alter table necesidades alter column telefono set not null;
alter table necesidades alter column nombre_contacto set not null;
alter table necesidades alter column confirmaciones set not null;
alter table necesidades alter column fuente set not null;

-- FKs (solo si no existen)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'necesidades_edificio_id_fkey'
  ) then
    alter table necesidades
      add constraint necesidades_edificio_id_fkey
      foreign key (edificio_id) references edificios_colapsados(id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'necesidades_merged_into_fkey'
  ) then
    alter table necesidades
      add constraint necesidades_merged_into_fkey
      foreign key (merged_into) references necesidades(id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'necesidades_fuente_check'
  ) then
    alter table necesidades
      add constraint necesidades_fuente_check
      check (fuente in ('ciudadano','instagram','tiktok','coordinador'));
  end if;
end $$;

create unique index if not exists necesidades_source_hash_uniq
  on necesidades (source_hash) where source_hash is not null;
create index if not exists necesidades_geo_idx on necesidades (lat, lng);
create index if not exists necesidades_estado_idx on necesidades (estado);

-- ── 3) recursos: columnas que faltan ─────────────────────────
alter table recursos add column if not exists subtipo text;
alter table recursos add column if not exists centro_acopio_id uuid;
alter table recursos add column if not exists direccion_origen text;
alter table recursos add column if not exists lat double precision;
alter table recursos add column if not exists lng double precision;
alter table recursos add column if not exists nombre_contacto text;
alter table recursos add column if not exists telefono text;
alter table recursos add column if not exists whatsapp text;

update recursos
set telefono = coalesce(nullif(trim(contacto), ''), 's/d'),
    nombre_contacto = coalesce(nullif(trim(nombre_contacto), ''), 'Donante')
where telefono is null or nombre_contacto is null;

alter table recursos alter column telefono set not null;
alter table recursos alter column nombre_contacto set not null;

-- ── 4) Funciones RPC ─────────────────────────────────────────
create or replace function _dist_m(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)
  ));
$$;

create or replace function necesidades_cercanas(
  p_lat double precision,
  p_lng double precision,
  p_radio_m double precision default 100000,
  p_tipo text default null
)
returns table (
  id uuid, zona text, direccion_exacta text, lat double precision, lng double precision,
  tipo text, tipos text[], subtipo text, urgencia text, descripcion text, cantidad text,
  nombre_contacto text, telefono text, whatsapp text, estado text, validada boolean,
  notas_coordinador text, confirmaciones int, fuente text, created_at timestamptz,
  distancia_m double precision
)
language sql stable as $$
  select n.id, n.zona, n.direccion_exacta, n.lat, n.lng, n.tipo, n.tipos, n.subtipo, n.urgencia,
         n.descripcion, n.cantidad, n.nombre_contacto, n.telefono, n.whatsapp, n.estado,
         n.validada, n.notas_coordinador, n.confirmaciones, n.fuente, n.created_at,
         _dist_m(p_lat, p_lng, n.lat, n.lng) as distancia_m
  from necesidades n
  where n.estado <> 'cubierta'
    and n.merged_into is null
    and n.lat is not null and n.lng is not null
    and (
      p_tipo is null
      or n.tipo = p_tipo
      or (n.tipos is not null and p_tipo = any(n.tipos))
    )
    and _dist_m(p_lat, p_lng, n.lat, n.lng) <= p_radio_m
  order by distancia_m asc;
$$;

create or replace function confirmar_necesidad(p_id uuid)
returns void language sql as $$
  update necesidades set confirmaciones = confirmaciones + 1 where id = p_id;
$$;

-- ── 5) RLS ───────────────────────────────────────────────────
alter table necesidades enable row level security;
alter table recursos enable row level security;
alter table centros_acopio enable row level security;
alter table edificios_colapsados enable row level security;

drop policy if exists "pub_read_necesidades" on necesidades;
drop policy if exists "pub_insert_necesidades" on necesidades;
drop policy if exists "pub_update_necesidades" on necesidades;
create policy "pub_read_necesidades"   on necesidades for select using (true);
create policy "pub_insert_necesidades" on necesidades for insert with check (true);
create policy "pub_update_necesidades" on necesidades for update using (true);

drop policy if exists "pub_read_recursos" on recursos;
drop policy if exists "pub_insert_recursos" on recursos;
drop policy if exists "pub_update_recursos" on recursos;
create policy "pub_read_recursos"   on recursos for select using (true);
create policy "pub_insert_recursos" on recursos for insert with check (true);
create policy "pub_update_recursos" on recursos for update using (true);

drop policy if exists "pub_read_acopio" on centros_acopio;
drop policy if exists "pub_insert_acopio" on centros_acopio;
drop policy if exists "pub_update_acopio" on centros_acopio;
create policy "pub_read_acopio"   on centros_acopio for select using (true);
create policy "pub_insert_acopio" on centros_acopio for insert with check (true);
create policy "pub_update_acopio" on centros_acopio for update using (true);

drop policy if exists "pub_read_edificios" on edificios_colapsados;
drop policy if exists "pub_insert_edificios" on edificios_colapsados;
drop policy if exists "pub_update_edificios" on edificios_colapsados;
create policy "pub_read_edificios"   on edificios_colapsados for select using (true);
create policy "pub_insert_edificios" on edificios_colapsados for insert with check (true);
create policy "pub_update_edificios" on edificios_colapsados for update using (true);

-- ── 6) Realtime ──────────────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'necesidades'
  ) then
    alter publication supabase_realtime add table necesidades;
  end if;
end $$;
