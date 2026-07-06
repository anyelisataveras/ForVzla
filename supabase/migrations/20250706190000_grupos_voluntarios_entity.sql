-- Entidad grupo: voluntarios, brigadas, sitios, jornadas y moderadoras pertenecen a un grupo.
-- Administrable desde Admin ForVzla (is_admin).

create table if not exists grupos_voluntarios (
  slug          text primary key,
  nombre        text not null,
  descripcion   text,
  ruta_web      text not null default '',
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint grupos_voluntarios_slug_fmt check (slug ~ '^[a-z][a-z0-9_]*$')
);

comment on table grupos_voluntarios is
  'Grupos de coordinación (ej. cuidadoras_caracas). Todo el módulo voluntarias/jornadas cuelga de slug.';
comment on column grupos_voluntarios.ruta_web is
  'Segmento URL pública, ej. cuidadoras-caracas → /cuidadoras-caracas';

insert into grupos_voluntarios (slug, nombre, descripcion, ruta_web, activo)
values (
  'cuidadoras_caracas',
  'Cuidadoras Caracas',
  'Madres Cuidadoras Voluntarias — Caracas y La Guaira',
  'cuidadoras-caracas',
  true
)
on conflict (slug) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  ruta_web = excluded.ruta_web,
  activo = true;

alter table grupos_voluntarios enable row level security;

create policy "pub_read_grupos_activos"
  on grupos_voluntarios for select
  using (activo = true);

create policy "admin_all_grupos_voluntarios"
  on grupos_voluntarios for all
  using (is_admin())
  with check (is_admin());

grant select on table grupos_voluntarios to anon, authenticated;

-- FK: todo hijo debe pertenecer a un grupo registrado
alter table voluntarios drop constraint if exists voluntarios_grupo_fkey;
alter table voluntarios
  add constraint voluntarios_grupo_fkey
  foreign key (grupo) references grupos_voluntarios(slug);

alter table brigadas drop constraint if exists brigadas_grupo_fkey;
alter table brigadas
  add constraint brigadas_grupo_fkey
  foreign key (grupo) references grupos_voluntarios(slug);

alter table sitios drop constraint if exists sitios_grupo_fkey;
alter table sitios
  add constraint sitios_grupo_fkey
  foreign key (grupo) references grupos_voluntarios(slug);

alter table jornadas drop constraint if exists jornadas_grupo_fkey;
alter table jornadas
  add constraint jornadas_grupo_fkey
  foreign key (grupo) references grupos_voluntarios(slug);

alter table moderadores_grupo drop constraint if exists moderadores_grupo_grupo_fkey;
alter table moderadores_grupo
  add constraint moderadores_grupo_grupo_fkey
  foreign key (grupo) references grupos_voluntarios(slug);

-- Validación centralizada
create or replace function public.grupo_voluntarios_valido(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from grupos_voluntarios g
    where g.slug = trim(coalesce(p_slug, ''))
      and g.activo = true
  );
$$;

grant execute on function public.grupo_voluntarios_valido(text) to anon, authenticated;

-- Catálogo público (landing / validación)
create or replace function public.grupo_voluntarios_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when g.slug is null then jsonb_build_object('ok', false)
    else jsonb_build_object(
      'ok', true,
      'grupo', jsonb_build_object(
        'slug', g.slug,
        'nombre', g.nombre,
        'descripcion', g.descripcion,
        'ruta_web', g.ruta_web
      )
    )
  end
  from grupos_voluntarios g
  where g.slug = trim(p_slug) and g.activo = true;
$$;

grant execute on function public.grupo_voluntarios_publico(text) to anon, authenticated;

-- Registro: solo grupos activos registrados
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
  if not grupo_voluntarios_valido(v_grupo) then
    raise exception 'Grupo no válido o inactivo';
  end if;
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

-- Refuerzo en auth voluntaria
create or replace function public.autenticar_voluntario(
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not grupo_voluntarios_valido(p_grupo) then
    return jsonb_build_object('ok', false, 'error', 'Grupo no válido');
  end if;
  if trim(coalesce(p_plataforma, '')) = '' or trim(coalesce(p_usuario, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Indica red social y usuario');
  end if;
  if length(_vol_cedula4(p_cedula4)) <> 4 then
    return jsonb_build_object('ok', false, 'error', 'Indica los 4 últimos dígitos de tu cédula');
  end if;

  select v.id, v.numero_voluntaria, v.nombre, v.apellido, v.brigadas,
         v.red_social_plataforma, v.red_social_usuario, v.grupo
  into v
  from voluntarios v
  where v.grupo = p_grupo
    and v.activa = true
    and coalesce(trim(v.red_social_plataforma), '') ilike trim(p_plataforma)
    and _vol_usuario_norm(v.red_social_usuario) = _vol_usuario_norm(p_usuario)
    and _vol_cedula4(v.id_dni) = _vol_cedula4(p_cedula4)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No encontramos tu registro. Revisa usuario y cédula, o regístrate.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'voluntario', jsonb_build_object(
      'id', v.id,
      'grupo', v.grupo,
      'numero_voluntaria', v.numero_voluntaria,
      'nombre', v.nombre,
      'apellido', v.apellido,
      'brigadas', coalesce(v.brigadas, '{}'::text[]),
      'red_social_plataforma', v.red_social_plataforma,
      'red_social_usuario', v.red_social_usuario
    )
  );
end;
$$;

-- jornadas_publicas: solo grupos válidos
create or replace function public.jornadas_publicas(p_grupo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not grupo_voluntarios_valido(p_grupo) then '[]'::jsonb
    else coalesce(jsonb_agg(row order by (row->>'fecha') asc), '[]'::jsonb)
  end
  from (
    select jsonb_build_object(
      'id', j.id,
      'grupo', j.grupo,
      'titulo', j.titulo,
      'fecha', j.fecha,
      'hora_salida', j.hora_salida,
      'estado', j.estado,
      'brigadas', j.brigadas,
      'sitio_nombre', s.nombre,
      'sitio_zona', s.zona
    ) as row
    from jornadas j
    left join sitios s on s.id = j.sitio_id
    where j.grupo = p_grupo
      and j.estado in ('abierta', 'llena', 'realizada')
      and j.fecha >= (current_date - interval '30 days')
    order by j.fecha asc
  ) sub;
$$;
