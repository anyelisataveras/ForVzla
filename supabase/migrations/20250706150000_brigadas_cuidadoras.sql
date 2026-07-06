-- Brigadas del grupo Cuidadoras Caracas (infograma Dari — Madres Cuidadoras Voluntarias)

create table if not exists brigadas (
  id                        uuid primary key default gen_random_uuid(),
  grupo                     text not null,
  slug                      text not null,
  nombre                    text not null,
  mision                    text not null,
  acciones                  text not null default '',
  requisitos                text not null default '',
  icono                     text not null default '',
  color_bg                  text not null default '#EEEBF6',
  color_fg                  text not null default '#463A82',
  orden                     smallint not null default 0,
  coordinador_voluntario_id uuid references voluntarios(id) on delete set null,
  activa                    boolean not null default true,
  created_at                timestamptz not null default now(),
  constraint brigadas_grupo_slug_unique unique (grupo, slug)
);

create index if not exists brigadas_grupo_idx on brigadas (grupo, orden);

alter table brigadas enable row level security;

-- Catálogo público (sin PII) — formulario y landing
create policy "pub_read_brigadas"
  on brigadas for select
  using (activa = true);

create policy "admin_all_brigadas"
  on brigadas for all
  using (is_admin())
  with check (is_admin());

grant select on table brigadas to anon, authenticated;

-- Voluntarias: slugs de brigadas elegidas
alter table voluntarios
  add column if not exists brigadas text[] not null default '{}',
  add column if not exists activa boolean not null default true,
  add column if not exists notas_internas text;

create index if not exists voluntarios_brigadas_gin_idx on voluntarios using gin (brigadas);

-- Solo slugs válidos del catálogo del grupo
create or replace function normalizar_brigadas_voluntario(p_grupo text, p_brigadas jsonb)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(b.slug order by b.orden), '{}'::text[])
  from brigadas b
  where b.grupo = p_grupo
    and b.activa = true
    and b.slug in (
      select trim(x)
      from jsonb_array_elements_text(coalesce(p_brigadas, '[]'::jsonb)) as t(x)
      where trim(x) <> ''
    );
$$;

grant execute on function normalizar_brigadas_voluntario(text, jsonb) to anon, authenticated;

-- Seed: 7 brigadas (documento infográfico coordinación)
insert into brigadas (grupo, slug, nombre, mision, acciones, requisitos, icono, color_bg, color_fg, orden)
values
  (
    'cuidadoras_caracas',
    'logistica_alimentos',
    'Brigada de Logística de Alimentos',
    'Preparar, trasladar y distribuir comidas de forma organizada.',
    'Preparación, traslado y distribución organizada de desayunos, almuerzos y cenas.',
    'Experiencia en cocina o logística de alimentos deseable. No es obligatorio.',
    '🍲', '#D6EAF8', '#1A5276', 1
  ),
  (
    'cuidadoras_caracas',
    'salud_medicamentos',
    'Brigada de Salud y Medicamentos',
    'Atención médica segura.',
    'Control del inventario médico y entrega supervisada de tratamientos a pacientes crónicos (hipertensión, diabetes).',
    'Profesión de salud o experiencia en primeros auxilios deseable.',
    '💊', '#D5F5E3', '#186A3B', 2
  ),
  (
    'cuidadoras_caracas',
    'clasificacion_donaciones',
    'Brigada de Clasificación de Donaciones',
    'Gestión de insumos donados.',
    'Recepción, conteo y organización (por tallas y necesidades) de ropa, artículos del hogar y kits de limpieza.',
    'Ninguno — todas pueden colaborar.',
    '📦', '#FCF3CF', '#7D6608', 3
  ),
  (
    'cuidadoras_caracas',
    'saneamiento',
    'Brigada de Saneamiento y Mantenimiento',
    'Espacios habitables.',
    'Limpieza y orden de áreas comunes para garantizar un ambiente higiénico y digno.',
    'Ninguno — todas pueden colaborar.',
    '🧹', '#FAE5D3', '#A04000', 4
  ),
  (
    'cuidadoras_caracas',
    'recreacion',
    'Brigada de Atención Directa y Recreación',
    'Ocio y movimiento para la comunidad.',
    'Organización de actividades deportivas, culturales y recreativas para mantener activa a la comunidad.',
    'Experiencia con niños deseable. No es obligatorio.',
    '⚽', '#FADBD8', '#922B21', 5
  ),
  (
    'cuidadoras_caracas',
    'contencion',
    'Brigada de Contención Emocional y Resguardo',
    'Apoyo psicoafectivo.',
    'Acompañamiento, escucha y protección brindada por madres voluntarias, con especial enfoque en los niños.',
    'Formación en psicología, trabajo social o experiencia en contención deseable.',
    '💜', '#E8DAEF', '#6C3483', 6
  ),
  (
    'cuidadoras_caracas',
    'social',
    'Brigada Social',
    'Atención integral a familias.',
    'Identificación de casos vulnerables, enlace con otras brigadas y atención general a las familias.',
    'Ninguno — todas pueden colaborar.',
    '🤝', '#D1F2EB', '#117A65', 7
  )
on conflict (grupo, slug) do update set
  nombre = excluded.nombre,
  mision = excluded.mision,
  acciones = excluded.acciones,
  requisitos = excluded.requisitos,
  icono = excluded.icono,
  color_bg = excluded.color_bg,
  color_fg = excluded.color_fg,
  orden = excluded.orden,
  activa = true;

-- RPC registro: incluir brigadas
create or replace function registrar_voluntario(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo text;
  v_id_dni text;
  v_numero int;
  v_id uuid;
  v_brigadas text[];
begin
  v_grupo := trim(coalesce(p_payload->>'grupo', ''));
  v_id_dni := trim(coalesce(p_payload->>'id_dni', ''));
  v_brigadas := normalizar_brigadas_voluntario(v_grupo, p_payload->'brigadas');

  if v_grupo = '' then raise exception 'Falta grupo'; end if;
  if v_id_dni = '' then raise exception 'Falta cédula o ID'; end if;
  if trim(coalesce(p_payload->>'nombre', '')) = '' then raise exception 'Falta nombre'; end if;
  if trim(coalesce(p_payload->>'apellido', '')) = '' then raise exception 'Falta apellido'; end if;
  if trim(coalesce(p_payload->>'telefono', '')) = '' then raise exception 'Falta teléfono'; end if;
  if coalesce((p_payload->>'declaracion_jurada')::boolean, false) is not true then
    raise exception 'Debe aceptar la declaración jurada';
  end if;

  if exists (select 1 from voluntarios where grupo = v_grupo and id_dni = v_id_dni) then
    raise exception 'Esta cédula ya está registrada en este grupo';
  end if;

  insert into voluntarios (
    grupo, nombre, apellido, edad, estado_civil, id_dni, telefono,
    pais, estado_provincia, ciudad, direccion,
    red_social_plataforma, red_social_usuario,
    profesion, oficio, disponibilidad, tiene_hijos, hijos,
    tareas, fortalezas, declaracion_jurada,
    asistencia_zona, medio_transporte, observaciones_logistica,
    brigadas
  ) values (
    v_grupo,
    trim(p_payload->>'nombre'),
    trim(p_payload->>'apellido'),
    nullif(p_payload->>'edad', '')::smallint,
    nullif(trim(p_payload->>'estado_civil'), ''),
    v_id_dni,
    trim(p_payload->>'telefono'),
    nullif(trim(p_payload->>'pais'), ''),
    nullif(trim(p_payload->>'estado_provincia'), ''),
    nullif(trim(p_payload->>'ciudad'), ''),
    nullif(trim(p_payload->>'direccion'), ''),
    nullif(trim(p_payload->>'red_social_plataforma'), ''),
    nullif(trim(p_payload->>'red_social_usuario'), ''),
    nullif(trim(p_payload->>'profesion'), ''),
    nullif(trim(p_payload->>'oficio'), ''),
    nullif(trim(p_payload->>'disponibilidad'), ''),
    nullif(trim(p_payload->>'tiene_hijos'), ''),
    coalesce(p_payload->'hijos', '[]'::jsonb),
    nullif(trim(p_payload->>'tareas'), ''),
    nullif(trim(p_payload->>'fortalezas'), ''),
    true,
    nullif(trim(p_payload->>'asistencia_zona'), ''),
    nullif(trim(p_payload->>'medio_transporte'), ''),
    nullif(trim(p_payload->>'observaciones_logistica'), ''),
    v_brigadas
  )
  returning numero_voluntaria, id into v_numero, v_id;

  return jsonb_build_object('numero_voluntaria', v_numero, 'id', v_id);
end;
$$;

grant execute on function registrar_voluntario(jsonb) to anon, authenticated;
