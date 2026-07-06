-- Sprint 1: inscripciones (RSVP), tareas_jornada, auth voluntaria vía RPC

-- ── Tablas ──

create table if not exists inscripciones (
  id                  uuid primary key default gen_random_uuid(),
  jornada_id          uuid not null references jornadas(id) on delete cascade,
  voluntario_id       uuid not null references voluntarios(id) on delete cascade,
  estado              text not null default 'pendiente'
    check (estado in ('pendiente','confirmada','no_puede','asistio','no_asistio')),
  necesita_transporte boolean not null default false,
  ofrece_transporte   boolean not null default false,
  cupos_ofrecidos     int not null default 0 check (cupos_ofrecidos >= 0 and cupos_ofrecidos <= 8),
  brigada_asignada    text,
  notas               text,
  respondido_at       timestamptz,
  created_at          timestamptz not null default now(),
  constraint inscripciones_jornada_vol_unique unique (jornada_id, voluntario_id)
);

create index if not exists inscripciones_jornada_idx on inscripciones (jornada_id);
create index if not exists inscripciones_vol_idx on inscripciones (voluntario_id);

create table if not exists tareas_jornada (
  id              uuid primary key default gen_random_uuid(),
  jornada_id      uuid not null references jornadas(id) on delete cascade,
  brigada_slug    text,
  titulo          text not null,
  descripcion     text,
  cupos           int not null default 1 check (cupos > 0 and cupos <= 20),
  voluntario_id   uuid references voluntarios(id) on delete set null,
  estado          text not null default 'sin_dueno'
    check (estado in ('sin_dueno','asignada','completada')),
  creada_por      text,
  created_at      timestamptz not null default now()
);

create index if not exists tareas_jornada_jornada_idx on tareas_jornada (jornada_id);

alter table inscripciones enable row level security;
alter table tareas_jornada enable row level security;

-- Moderadoras: acceso vía jornada.grupo
create policy "mod_read_inscripciones"
  on inscripciones for select
  using (exists (
    select 1 from jornadas j
    where j.id = inscripciones.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ));

create policy "mod_write_inscripciones"
  on inscripciones for all
  using (exists (
    select 1 from jornadas j
    where j.id = inscripciones.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ))
  with check (exists (
    select 1 from jornadas j
    where j.id = inscripciones.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ));

create policy "mod_read_tareas"
  on tareas_jornada for select
  using (exists (
    select 1 from jornadas j
    where j.id = tareas_jornada.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ));

create policy "mod_write_tareas"
  on tareas_jornada for all
  using (exists (
    select 1 from jornadas j
    where j.id = tareas_jornada.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ))
  with check (exists (
    select 1 from jornadas j
    where j.id = tareas_jornada.jornada_id
      and (is_admin() or is_moderador_grupo(j.grupo))
  ));

grant select on inscripciones to authenticated;
grant select on tareas_jornada to authenticated;

-- ── Helpers auth voluntaria (sin Supabase Auth; credenciales en cada RPC) ──

create or replace function public._vol_usuario_norm(p text)
returns text
language sql immutable
as $$ select lower(trim(both '@' from coalesce(p, ''))); $$;

create or replace function public._vol_cedula4(p text)
returns text
language sql immutable
as $$ select right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 4); $$;

create or replace function public._voluntario_cred_ok(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from voluntarios v
    where v.id = p_voluntario_id
      and v.grupo = p_grupo
      and v.activa = true
      and coalesce(trim(v.red_social_plataforma), '') ilike trim(coalesce(p_plataforma, ''))
      and _vol_usuario_norm(v.red_social_usuario) = _vol_usuario_norm(p_usuario)
      and length(_vol_cedula4(v.id_dni)) = 4
      and _vol_cedula4(v.id_dni) = _vol_cedula4(p_cedula4)
  );
$$;

-- Login voluntaria: devuelve datos sin PII sensible (sin notas_internas)
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
  if trim(coalesce(p_grupo, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta grupo');
  end if;
  if trim(coalesce(p_plataforma, '')) = '' or trim(coalesce(p_usuario, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Indica red social y usuario');
  end if;
  if length(_vol_cedula4(p_cedula4)) <> 4 then
    return jsonb_build_object('ok', false, 'error', 'Indica los 4 últimos dígitos de tu cédula');
  end if;

  select v.id, v.numero_voluntaria, v.nombre, v.apellido, v.brigadas,
         v.red_social_plataforma, v.red_social_usuario
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

grant execute on function public.autenticar_voluntario(text, text, text, text) to anon, authenticated;

create or replace function public.actualizar_brigadas_voluntario(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_brigadas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brigadas text[];
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida');
  end if;
  v_brigadas := normalizar_brigadas_voluntario(p_grupo, p_brigadas);
  update voluntarios set brigadas = v_brigadas where id = p_voluntario_id;
  return jsonb_build_object('ok', true, 'brigadas', v_brigadas);
end;
$$;

grant execute on function public.actualizar_brigadas_voluntario(uuid, text, text, text, text, jsonb) to anon, authenticated;

-- Jornada pública (sin contacto de sitio)
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

-- Listar jornadas públicas del grupo
create or replace function public.jornadas_publicas(p_grupo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'fecha') asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', j.id,
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

grant execute on function public.jornadas_publicas(text) to anon, authenticated;

-- Tareas de jornada (sin teléfonos; solo primer nombre de asignada)
create or replace function public.tareas_jornada_publicas(p_jornada_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'titulo', t.titulo,
      'descripcion', t.descripcion,
      'brigada_slug', t.brigada_slug,
      'cupos', t.cupos,
      'estado', t.estado,
      'voluntario_id', t.voluntario_id,
      'asignada_nombre', v.nombre,
      'es_mia', false
    ) order by t.created_at
  ), '[]'::jsonb)
  from tareas_jornada t
  left join voluntarios v on v.id = t.voluntario_id
  join jornadas j on j.id = t.jornada_id
  where t.jornada_id = p_jornada_id
    and j.estado in ('abierta', 'llena', 'realizada');
$$;

grant execute on function public.tareas_jornada_publicas(uuid) to anon, authenticated;

-- RSVP
create or replace function public.guardar_inscripcion_jornada(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_jornada_id uuid,
  p_estado text,
  p_necesita_transporte boolean,
  p_ofrece_transporte boolean,
  p_cupos_ofrecidos int,
  p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jornada record;
  v_cupos int;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida');
  end if;

  select * into v_jornada from jornadas
  where id = p_jornada_id and grupo = p_grupo
    and estado in ('abierta', 'llena');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Jornada no disponible para confirmar');
  end if;

  if p_estado not in ('confirmada', 'no_puede') then
    return jsonb_build_object('ok', false, 'error', 'Estado inválido');
  end if;

  v_cupos := greatest(0, least(coalesce(p_cupos_ofrecidos, 0), 8));
  if not coalesce(p_ofrece_transporte, false) then v_cupos := 0; end if;

  insert into inscripciones (
    jornada_id, voluntario_id, estado,
    necesita_transporte, ofrece_transporte, cupos_ofrecidos,
    notas, respondido_at
  ) values (
    p_jornada_id, p_voluntario_id, p_estado,
    coalesce(p_necesita_transporte, false),
    coalesce(p_ofrece_transporte, false),
    v_cupos,
    nullif(trim(p_notas), ''),
    now()
  )
  on conflict (jornada_id, voluntario_id) do update set
    estado = excluded.estado,
    necesita_transporte = excluded.necesita_transporte,
    ofrece_transporte = excluded.ofrece_transporte,
    cupos_ofrecidos = excluded.cupos_ofrecidos,
    notas = excluded.notas,
    respondido_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.guardar_inscripcion_jornada(uuid, text, text, text, text, uuid, text, boolean, boolean, int, text) to anon, authenticated;

-- Mi inscripción (solo la propia)
create or replace function public.mi_inscripcion_jornada(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_jornada_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when i.id is null then jsonb_build_object('ok', true, 'inscripcion', null)
    else jsonb_build_object('ok', true, 'inscripcion', jsonb_build_object(
      'estado', i.estado,
      'necesita_transporte', i.necesita_transporte,
      'ofrece_transporte', i.ofrece_transporte,
      'cupos_ofrecidos', i.cupos_ofrecidos,
      'notas', i.notas,
      'respondido_at', i.respondido_at
    ))
  end
  from (select 1) x
  left join inscripciones i on i.jornada_id = p_jornada_id and i.voluntario_id = p_voluntario_id
  where _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4);
$$;

grant execute on function public.mi_inscripcion_jornada(uuid, text, text, text, text, uuid) to anon, authenticated;

-- Tomar tarea
create or replace function public.tomar_tarea_jornada(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_tarea_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarea record;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'Sesión inválida');
  end if;

  select t.*, j.estado as j_estado, j.grupo
  into v_tarea
  from tareas_jornada t
  join jornadas j on j.id = t.jornada_id
  where t.id = p_tarea_id and j.grupo = p_grupo;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Tarea no encontrada');
  end if;
  if v_tarea.j_estado not in ('abierta', 'llena') then
    return jsonb_build_object('ok', false, 'error', 'Jornada cerrada');
  end if;
  if v_tarea.voluntario_id is not null and v_tarea.voluntario_id <> p_voluntario_id then
    return jsonb_build_object('ok', false, 'error', 'Ya tiene dueña');
  end if;

  update tareas_jornada
  set voluntario_id = p_voluntario_id, estado = 'asignada'
  where id = p_tarea_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.tomar_tarea_jornada(uuid, text, text, text, text, uuid) to anon, authenticated;

-- Resumen transporte para moderadoras (vista agregada)
create or replace function public.resumen_transporte_jornada(p_jornada_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'necesitan', coalesce(sum(case when i.estado = 'confirmada' and i.necesita_transporte then 1 else 0 end), 0),
    'cupos', coalesce(sum(case when i.estado = 'confirmada' and i.ofrece_transporte then i.cupos_ofrecidos else 0 end), 0),
    'confirmadas', coalesce(sum(case when i.estado = 'confirmada' then 1 else 0 end), 0)
  )
  from inscripciones i
  join jornadas j on j.id = i.jornada_id
  where i.jornada_id = p_jornada_id
    and (is_admin() or is_moderador_grupo(j.grupo));
$$;

grant execute on function public.resumen_transporte_jornada(uuid) to authenticated;
