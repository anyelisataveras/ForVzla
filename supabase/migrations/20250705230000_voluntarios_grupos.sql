-- Voluntarios por grupo (ej. Cuidadoras Caracas). PII: solo insert público + lectura admin.

create table if not exists voluntarios (
  id                    uuid primary key default gen_random_uuid(),
  numero_voluntaria     serial,
  grupo                 text not null,
  nombre                text not null,
  apellido              text not null,
  edad                  smallint,
  estado_civil          text,
  id_dni                text not null,
  telefono              text not null,
  pais                  text,
  estado_provincia      text,
  ciudad                text,
  direccion             text,
  red_social_plataforma text,
  red_social_usuario    text,
  profesion             text,
  oficio                text,
  disponibilidad        text,
  tiene_hijos           text,
  hijos                 jsonb not null default '[]'::jsonb,
  tareas                text,
  fortalezas            text,
  declaracion_jurada    boolean not null default true,
  asistencia_zona       text,
  medio_transporte      text,
  observaciones_logistica text,
  created_at            timestamptz not null default now(),
  constraint voluntarios_grupo_dni_unique unique (grupo, id_dni)
);

create index if not exists voluntarios_grupo_idx on voluntarios (grupo);
create index if not exists voluntarios_created_idx on voluntarios (created_at desc);

alter table voluntarios enable row level security;

-- PII: nadie lee por anon; solo coordinadoras vía admin
create policy "voluntarios_insert_publico"
  on voluntarios for insert
  with check (
    declaracion_jurada = true
    and char_length(trim(nombre)) > 0
    and char_length(trim(apellido)) > 0
    and char_length(trim(id_dni)) > 0
    and char_length(trim(telefono)) > 0
    and char_length(trim(grupo)) > 0
  );

create policy "admin_read_voluntarios"
  on voluntarios for select
  using (is_admin());

create policy "admin_update_voluntarios"
  on voluntarios for update
  using (is_admin());

create policy "admin_delete_voluntarios"
  on voluntarios for delete
  using (is_admin());

-- Chequeo de duplicado sin exponer filas (anon puede llamar)
create or replace function voluntario_existe(p_grupo text, p_id_dni text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from voluntarios
    where grupo = p_grupo and id_dni = trim(p_id_dni)
  );
$$;

grant execute on function voluntario_existe(text, text) to anon, authenticated;

grant insert on table voluntarios to anon, authenticated;
