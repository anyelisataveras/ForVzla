-- Ayuda Venezuela — esquema inicial
-- Terremoto Yaracuy 24-jun-2026

create table edificios_colapsados (
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

create table necesidades (
  id uuid default gen_random_uuid() primary key,
  zona text not null,
  direccion_exacta text not null,
  lat double precision,
  lng double precision,
  tipo text not null,
  tipos text[],
  subtipo text,
  urgencia text not null default 'urgente' check (urgencia in ('critica','urgente','normal')),
  descripcion text not null,
  cantidad text,
  personas_afectadas int,
  nombre_contacto text not null,
  telefono text not null,
  whatsapp text,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_proceso','cubierta')),
  validada boolean default false,
  notas_coordinador text,
  edificio_id uuid references edificios_colapsados(id),
  fuente text not null default 'ciudadano' check (fuente in ('ciudadano','instagram','tiktok','coordinador')),
  source_url text,
  source_hash text,
  confirmaciones int not null default 1,
  merged_into uuid references necesidades(id),
  created_at timestamptz default now()
);

create unique index necesidades_source_hash_uniq
  on necesidades (source_hash) where source_hash is not null;
create index necesidades_geo_idx on necesidades (lat, lng);
create index necesidades_estado_idx on necesidades (estado);

create table recursos (
  id uuid default gen_random_uuid() primary key,
  tipo text not null,
  subtipo text,
  cantidad text not null,
  centro_acopio_id uuid,
  zona_origen text,
  direccion_origen text,
  lat double precision,
  lng double precision,
  nombre_contacto text not null,
  telefono text not null,
  whatsapp text,
  notas text,
  estado text not null default 'disponible' check (estado in ('disponible','asignado','entregado')),
  created_at timestamptz default now()
);

create table centros_acopio (
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
