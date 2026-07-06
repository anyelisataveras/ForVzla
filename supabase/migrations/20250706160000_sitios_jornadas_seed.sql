-- Sitios + jornadas (actividades) — Cuidadoras Caracas
-- Censo agregado sin PII (sin nombres de menores).

create table if not exists sitios (
  id                    uuid primary key default gen_random_uuid(),
  grupo                 text not null,
  nombre                text not null,
  alias                 text,
  zona                  text not null,
  direccion             text,
  lat                   double precision,
  lng                   double precision,
  -- Censo niños (agregado — reunión Yeudi: solo cantidades)
  ninos_total           int,
  ninas                 int,
  ninos_varones         int,
  neodivergentes        int,
  personas_afectadas    int,
  contacto_nombre       text,
  contacto_telefono     text,
  permiso_verificado    boolean not null default false,
  permiso_por           text,
  cobertura_comida      text not null default 'ninguna'
    check (cobertura_comida in ('ninguna','baja','ok','sobra')),
  cobertura_medicinas   text not null default 'ninguna'
    check (cobertura_medicinas in ('ninguna','baja','ok','sobra')),
  cobertura_cotillon    text not null default 'ninguna'
    check (cobertura_cotillon in ('ninguna','baja','ok','sobra')),
  cobertura_recreacion  text not null default 'ninguna'
    check (cobertura_recreacion in ('ninguna','baja','ok','sobra')),
  ultima_visita_at      timestamptz,
  notas                 text,
  ayuda_duplicada       boolean not null default false,
  activo                boolean not null default true,
  created_at            timestamptz not null default now()
);

create index if not exists sitios_grupo_idx on sitios (grupo);
create unique index if not exists sitios_grupo_nombre_idx on sitios (grupo, lower(nombre));

create table if not exists jornadas (
  id                    uuid primary key default gen_random_uuid(),
  grupo                 text not null,
  titulo                text not null,
  sitio_id              uuid references sitios(id) on delete set null,
  fecha                 date not null,
  hora_salida           time,
  hora_encuentro        time,
  punto_encuentro       text,
  hora_regreso_aprox    time,
  descripcion           text,
  brigadas              text[] not null default '{}',
  vestimenta            text,
  llevar                text,
  meta_voluntarias      int,
  meta_vehiculos        int,
  estado                text not null default 'borrador'
    check (estado in ('borrador','abierta','llena','realizada','cancelada')),
  creada_por            text,
  notas_internas        text,
  created_at            timestamptz not null default now()
);

create index if not exists jornadas_grupo_fecha_idx on jornadas (grupo, fecha desc);
create index if not exists jornadas_sitio_idx on jornadas (sitio_id);

alter table sitios enable row level security;
alter table jornadas enable row level security;

-- Políticas iniciales (idempotente; 170000 las amplía para moderadoras)
drop policy if exists "pub_read_jornadas_abiertas" on jornadas;
create policy "pub_read_jornadas_abiertas"
  on jornadas for select
  using (estado in ('abierta','llena','realizada'));

drop policy if exists "admin_all_jornadas" on jornadas;
create policy "admin_all_jornadas"
  on jornadas for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_all_sitios" on sitios;
create policy "admin_all_sitios"
  on sitios for all
  using (is_admin())
  with check (is_admin());

grant select on table jornadas to anon, authenticated;
grant select on table sitios to anon, authenticated;
grant select, insert, update, delete on table jornadas to authenticated;

-- ── SEED: Miércoles 8 jul 2026 — Campo Rico (dato coordinación, jul 2026) ──
insert into sitios (
  grupo, nombre, zona, direccion,
  ninos_total, ninas, ninos_varones, neodivergentes,
  personas_afectadas, notas, permiso_verificado, activo
) values (
  'cuidadoras_caracas',
  'Complejo Educativo Industrial Leonardo Infante',
  'Campo Rico, Caracas',
  'Campo Rico',
  115, 45, 70, 3,
  115,
  'Censo completo recibido de coordinación para jornada del miércoles 8-jul-2026. 115 niños: 45 niñas, 70 niños, 3 neodivergentes.',
  true,
  true
)
on conflict (grupo, lower(nombre)) do update set
  zona = excluded.zona,
  direccion = excluded.direccion,
  ninos_total = excluded.ninos_total,
  ninas = excluded.ninas,
  ninos_varones = excluded.ninos_varones,
  neodivergentes = excluded.neodivergentes,
  personas_afectadas = excluded.personas_afectadas,
  notas = excluded.notas,
  permiso_verificado = excluded.permiso_verificado,
  activo = true;

insert into jornadas (
  grupo, titulo, sitio_id, fecha,
  hora_salida, hora_encuentro, punto_encuentro, hora_regreso_aprox,
  descripcion, brigadas, vestimenta, llevar,
  meta_voluntarias, estado, notas_internas
)
select
  'cuidadoras_caracas',
  'Jornada recreación — Campo Rico',
  s.id,
  '2026-07-08'::date,
  '13:00'::time,
  null,
  null,
  '16:00'::time,
  'Llevamos recreación y contención a los niños: pinta caritas, cuentos, dinámicas y kits emocionales. Censo: 115 niños (45 niñas, 70 niños, 3 neodivergentes).',
  array['recreacion','contencion']::text[],
  'Franela negra, jeans, gomas',
  'Carnet, agua',
  12,
  'abierta',
  'Seed desde coordinación — Complejo Educativo Industrial Leonardo Infante.'
from sitios s
where s.grupo = 'cuidadoras_caracas'
  and lower(s.nombre) = lower('Complejo Educativo Industrial Leonardo Infante')
  and not exists (
    select 1 from jornadas j
    where j.grupo = 'cuidadoras_caracas'
      and j.fecha = '2026-07-08'::date
      and j.titulo = 'Jornada recreación — Campo Rico'
  );

-- ── SEED: Martes 7 jul 2026 — La Guaira / Catia la Mar (chat grupo WA) ──
insert into sitios (
  grupo, nombre, alias, zona, direccion,
  notas, permiso_verificado, permiso_por, activo
) values (
  'cuidadoras_caracas',
  'Catia La Mar',
  'Zona de salida hacia refugios en La Guaira',
  'La Guaira',
  'Catia La Mar',
  'Jornada martes 7-jul-2026. Salida 9:00 desde Plaza Venezuela (encuentro 8:30). Pendiente censo detallado en sitio.',
  true,
  'Jeudy',
  true
)
on conflict (grupo, lower(nombre)) do update set
  alias = excluded.alias,
  zona = excluded.zona,
  notas = excluded.notas,
  permiso_verificado = excluded.permiso_verificado,
  permiso_por = excluded.permiso_por,
  activo = true;

insert into jornadas (
  grupo, titulo, sitio_id, fecha,
  hora_salida, hora_encuentro, punto_encuentro, hora_regreso_aprox,
  descripcion, brigadas, vestimenta, llevar,
  meta_voluntarias, meta_vehiculos, estado, notas_internas
)
select
  'cuidadoras_caracas',
  'Jornada recreación — Catia La Mar',
  s.id,
  '2026-07-07'::date,
  '09:00'::time,
  '08:30'::time,
  'Plaza Venezuela',
  '14:00'::time,
  'Misión: llevar felicidad a los niños — pinta caritas, cuentos, dinámicas. Brindar respiro a las mamás. Regreso antes del anochecer.',
  array['recreacion','contencion']::text[],
  'Franela negra, jeans, gomas o botas deportivas',
  'Carnet de voluntaria, agua',
  10,
  2,
  'abierta',
  'Seed desde chat coordinadoras — salida conjunta protegida, transporte coordinado por Cindy.'
from sitios s
where s.grupo = 'cuidadoras_caracas'
  and lower(s.nombre) = lower('Catia La Mar')
  and not exists (
    select 1 from jornadas j
    where j.grupo = 'cuidadoras_caracas'
      and j.fecha = '2026-07-07'::date
      and j.titulo = 'Jornada recreación — Catia La Mar'
  );
