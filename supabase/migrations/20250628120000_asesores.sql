-- Directorio de orientación profesional gratuita (sin geolocalización)

create table if not exists asesores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  profesion     text,
  categoria     text not null,
  descripcion   text not null,
  modos         text[] default '{}',
  disponibilidad text,
  idiomas       text default 'Español',
  telefono      text not null,
  whatsapp      text,
  estado        text not null default 'activo' check (estado in ('activo', 'pausado')),
  created_at    timestamptz not null default now()
);

create index if not exists asesores_estado_idx on asesores (estado);
create index if not exists asesores_categoria_idx on asesores (categoria);

alter table asesores enable row level security;

create policy "asesores lectura pública"
  on asesores for select using (estado = 'activo');

create policy "admin_read_asesores"
  on asesores for select using (is_admin());

create policy "asesores alta pública"
  on asesores for insert with check (true);

create policy "admin_update_asesores"
  on asesores for update using (is_admin());

create policy "admin_delete_asesores"
  on asesores for delete using (is_admin());

alter publication supabase_realtime add table asesores;
