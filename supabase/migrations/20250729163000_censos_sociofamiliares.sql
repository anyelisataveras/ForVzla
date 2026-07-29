-- Censo sociofamiliar por jornada (ARTIFACT-FOR-004)
-- PII: núcleo familiar puede incluir nombres/edades (campos opcionales; default PM/planner).
-- Online-first: sin persistencia local. Sin UPDATE en v1.

create or replace function public.norm_documento_identidad(p_doc text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(p_doc, '')), '[^0-9A-Za-z]', '', 'g'));
$$;

comment on function public.norm_documento_identidad(text) is
  'Normaliza cédula/documento para dedup de censos sociofamiliares (grupo).';

create table if not exists public.censos_sociofamiliares (
  id uuid primary key default gen_random_uuid(),
  grupo text not null,
  jornada_id uuid not null references public.jornadas(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete restrict,
  voluntario_id uuid not null references public.voluntarios(id) on delete restrict,
  -- Representante (VG1: todos obligatorios excepto correo)
  rep_nombre text not null,
  rep_documento text not null,
  documento_norm text not null,
  rep_edad int,
  rep_telefono text not null,
  rep_correo text,
  rep_parentesco text not null,
  -- Bloques opcionales (docx)
  vivienda jsonb,
  nucleo_familiar jsonb not null default '[]'::jsonb,
  salud jsonb,
  apoyos jsonb,
  necesidades text[] not null default '{}'::text[],
  observaciones text,
  prioridad text check (prioridad is null or prioridad in ('alta', 'media', 'baja')),
  seguimiento_requerido boolean,
  created_at timestamptz not null default now(),
  constraint censos_nucleo_familiar_is_array check (jsonb_typeof(nucleo_familiar) = 'array')
);

create index if not exists censos_sociofamiliares_grupo_doc_idx
  on public.censos_sociofamiliares (grupo, documento_norm);
create index if not exists censos_sociofamiliares_jornada_idx
  on public.censos_sociofamiliares (jornada_id);
create index if not exists censos_sociofamiliares_sitio_idx
  on public.censos_sociofamiliares (sitio_id);
create index if not exists censos_sociofamiliares_voluntario_idx
  on public.censos_sociofamiliares (voluntario_id);

alter table public.censos_sociofamiliares enable row level security;

-- Sin policies de acceso directo: solo RPCs security definer.
revoke all on table public.censos_sociofamiliares from anon, authenticated;
grant select, insert on table public.censos_sociofamiliares to service_role;

-- Incluir sitio_id en jornada pública (captura UI)
create or replace function public.jornada_publica(p_jornada_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'jornada', jsonb_build_object(
      'id', j.id,
      'grupo', j.grupo,
      'titulo', j.titulo,
      'fecha', j.fecha,
      'hora_salida', j.hora_salida,
      'hora_encuentro', j.hora_encuentro,
      'punto_encuentro', j.punto_encuentro,
      'hora_regreso_aprox', j.hora_regreso_aprox,
      'descripcion', j.descripcion,
      'brigadas', j.brigadas,
      'vestimenta', j.vestimenta,
      'llevar', j.llevar,
      'estado', j.estado,
      'sitio_id', j.sitio_id,
      'sitio_nombre', s.nombre,
      'sitio_zona', s.zona
    )
  )
  from jornadas j
  left join sitios s on s.id = j.sitio_id
  where j.id = p_jornada_id
    and j.estado in ('abierta', 'llena', 'realizada');
$$;

grant execute on function public.jornada_publica(uuid) to anon, authenticated;

create or replace function public.buscar_censo_por_documento(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_documento text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm text;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida');
  end if;

  v_norm := norm_documento_identidad(p_documento);
  if v_norm = '' then
    return jsonb_build_object('ok', true, 'matches', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'jornada_id', c.jornada_id,
        'jornada_titulo', j.titulo,
        'jornada_fecha', j.fecha,
        'sitio_id', c.sitio_id,
        'sitio_nombre', s.nombre,
        'sitio_zona', s.zona,
        'voluntario_id', c.voluntario_id,
        'voluntaria_nombre', trim(concat(v.nombre, ' ', coalesce(v.apellido, ''))),
        'rep_nombre', c.rep_nombre,
        'rep_documento', c.rep_documento,
        'prioridad', c.prioridad,
        'created_at', c.created_at
      ) order by c.created_at desc)
      from censos_sociofamiliares c
      join jornadas j on j.id = c.jornada_id
      join sitios s on s.id = c.sitio_id
      join voluntarios v on v.id = c.voluntario_id
      where c.grupo = trim(p_grupo)
        and c.documento_norm = v_norm
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.buscar_censo_por_documento(uuid, text, text, text, text, text) to anon, authenticated;

create or replace function public.guardar_censo_sociofamiliar(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_jornada_id uuid,
  p_rep_nombre text,
  p_rep_documento text,
  p_rep_edad int,
  p_rep_telefono text,
  p_rep_correo text,
  p_rep_parentesco text,
  p_vivienda jsonb,
  p_nucleo_familiar jsonb,
  p_salud jsonb,
  p_apoyos jsonb,
  p_necesidades text[],
  p_observaciones text,
  p_prioridad text,
  p_seguimiento_requerido boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jornada record;
  v_norm text;
  v_insc text;
  v_id uuid;
  v_prio text;
  v_nucleo jsonb;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida');
  end if;

  select j.id, j.grupo, j.sitio_id, j.estado, j.fecha, j.titulo
  into v_jornada
  from jornadas j
  where j.id = p_jornada_id and j.grupo = trim(p_grupo);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Jornada no encontrada');
  end if;

  if v_jornada.estado not in ('abierta', 'llena', 'realizada') then
    return jsonb_build_object('ok', false, 'error', 'Esta jornada no acepta censos');
  end if;

  if v_jornada.sitio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Esta jornada no tiene sitio asignado');
  end if;

  select i.estado into v_insc
  from inscripciones i
  where i.jornada_id = p_jornada_id and i.voluntario_id = p_voluntario_id;

  if v_insc is null or v_insc not in ('confirmada', 'asistio') then
    return jsonb_build_object('ok', false, 'error', 'Debes estar inscrita en la jornada para levantar un censo');
  end if;

  if trim(coalesce(p_rep_nombre, '')) = ''
     or trim(coalesce(p_rep_documento, '')) = ''
     or trim(coalesce(p_rep_telefono, '')) = ''
     or trim(coalesce(p_rep_parentesco, '')) = ''
     or p_rep_edad is null then
    return jsonb_build_object('ok', false, 'error', 'Completa los datos obligatorios del representante');
  end if;

  if p_rep_edad < 0 or p_rep_edad > 120 then
    return jsonb_build_object('ok', false, 'error', 'Edad del representante inválida');
  end if;

  v_norm := norm_documento_identidad(p_rep_documento);
  if v_norm = '' then
    return jsonb_build_object('ok', false, 'error', 'Documento inválido');
  end if;

  v_prio := nullif(lower(trim(coalesce(p_prioridad, ''))), '');
  if v_prio is not null and v_prio not in ('alta', 'media', 'baja') then
    return jsonb_build_object('ok', false, 'error', 'Prioridad inválida');
  end if;

  v_nucleo := coalesce(p_nucleo_familiar, '[]'::jsonb);
  if jsonb_typeof(v_nucleo) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Núcleo familiar inválido');
  end if;

  insert into censos_sociofamiliares (
    grupo, jornada_id, sitio_id, voluntario_id,
    rep_nombre, rep_documento, documento_norm, rep_edad, rep_telefono, rep_correo, rep_parentesco,
    vivienda, nucleo_familiar, salud, apoyos, necesidades, observaciones,
    prioridad, seguimiento_requerido
  ) values (
    trim(p_grupo), p_jornada_id, v_jornada.sitio_id, p_voluntario_id,
    trim(p_rep_nombre), trim(p_rep_documento), v_norm, p_rep_edad, trim(p_rep_telefono),
    nullif(trim(coalesce(p_rep_correo, '')), ''),
    trim(p_rep_parentesco),
    p_vivienda, v_nucleo, p_salud, p_apoyos,
    coalesce(p_necesidades, '{}'::text[]),
    nullif(trim(coalesce(p_observaciones, '')), ''),
    v_prio, p_seguimiento_requerido
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.guardar_censo_sociofamiliar(
  uuid, text, text, text, text, uuid,
  text, text, int, text, text, text,
  jsonb, jsonb, jsonb, jsonb, text[], text, text, boolean
) to anon, authenticated;

create or replace function public.listar_censos_jornada(
  p_grupo text,
  p_jornada_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (is_admin() or is_coordinador_grupo(p_grupo)) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  if not exists (
    select 1 from jornadas j where j.id = p_jornada_id and j.grupo = trim(p_grupo)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Jornada no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'censos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'rep_nombre', c.rep_nombre,
        'rep_documento', c.rep_documento,
        'rep_telefono', c.rep_telefono,
        'prioridad', c.prioridad,
        'seguimiento_requerido', c.seguimiento_requerido,
        'voluntario_id', c.voluntario_id,
        'voluntaria_nombre', trim(concat(v.nombre, ' ', coalesce(v.apellido, ''))),
        'sitio_id', c.sitio_id,
        'sitio_nombre', s.nombre,
        'created_at', c.created_at
      ) order by c.created_at desc)
      from censos_sociofamiliares c
      join voluntarios v on v.id = c.voluntario_id
      join sitios s on s.id = c.sitio_id
      where c.jornada_id = p_jornada_id and c.grupo = trim(p_grupo)
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.listar_censos_jornada(text, uuid) to authenticated;

create or replace function public.obtener_censo_sociofamiliar(
  p_grupo text,
  p_censo_id uuid,
  p_voluntario_id uuid default null,
  p_plataforma text default null,
  p_usuario text default null,
  p_cedula4 text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
  c record;
begin
  if is_admin() or is_coordinador_grupo(p_grupo) then
    v_ok := true;
  elsif p_voluntario_id is not null
    and _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    v_ok := true;
  end if;

  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  select
    c0.*,
    j.titulo as jornada_titulo,
    j.fecha as jornada_fecha,
    s.nombre as sitio_nombre,
    s.zona as sitio_zona,
    trim(concat(v.nombre, ' ', coalesce(v.apellido, ''))) as voluntaria_nombre
  into c
  from censos_sociofamiliares c0
  join jornadas j on j.id = c0.jornada_id
  join sitios s on s.id = c0.sitio_id
  join voluntarios v on v.id = c0.voluntario_id
  where c0.id = p_censo_id and c0.grupo = trim(p_grupo);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Censo no encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'censo', jsonb_build_object(
      'id', c.id,
      'grupo', c.grupo,
      'jornada_id', c.jornada_id,
      'jornada_titulo', c.jornada_titulo,
      'jornada_fecha', c.jornada_fecha,
      'sitio_id', c.sitio_id,
      'sitio_nombre', c.sitio_nombre,
      'sitio_zona', c.sitio_zona,
      'voluntario_id', c.voluntario_id,
      'voluntaria_nombre', c.voluntaria_nombre,
      'rep_nombre', c.rep_nombre,
      'rep_documento', c.rep_documento,
      'rep_edad', c.rep_edad,
      'rep_telefono', c.rep_telefono,
      'rep_correo', c.rep_correo,
      'rep_parentesco', c.rep_parentesco,
      'vivienda', c.vivienda,
      'nucleo_familiar', c.nucleo_familiar,
      'salud', c.salud,
      'apoyos', c.apoyos,
      'necesidades', c.necesidades,
      'observaciones', c.observaciones,
      'prioridad', c.prioridad,
      'seguimiento_requerido', c.seguimiento_requerido,
      'created_at', c.created_at
    )
  );
end;
$$;

grant execute on function public.obtener_censo_sociofamiliar(text, uuid, uuid, text, text, text) to anon, authenticated;
