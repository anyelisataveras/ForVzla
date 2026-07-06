-- Fix: asignación interna sin doble chequeo de permiso + backfill censo importado.

create or replace function public._es_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

create or replace function public._sugerir_brigadas_voluntario_core(
  p_voluntario_id uuid,
  p_max int default 2
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  v_texto text;
  v_max int;
  v_brigadas text[];
  v_puntajes jsonb;
begin
  v_max := greatest(1, least(coalesce(p_max, 2), 3));

  select *
  into v
  from voluntarios
  where id = p_voluntario_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Voluntaria no encontrada');
  end if;

  v_texto := _vol_texto_fit(v.profesion, v.oficio, v.tareas, v.fortalezas, v.observaciones_logistica);

  with scored as (
    select
      b.slug,
      b.nombre,
      b.orden,
      _puntaje_brigada_fit(v_texto, b.slug, v.tiene_hijos, v.medio_transporte) as puntaje
    from brigadas b
    where b.grupo = v.grupo
      and b.activa = true
  ),
  ranked as (
    select slug, nombre, puntaje,
      row_number() over (order by puntaje desc, orden asc) as rn,
      max(puntaje) over () as top_score
    from scored
  ),
  picked as (
    select slug, nombre, puntaje
    from ranked
    where puntaje > 0
      and (
        rn = 1
        or (rn = 2 and puntaje >= 5 and puntaje >= top_score - 3)
      )
    order by puntaje desc, slug
    limit v_max
  )
  select
    coalesce(array_agg(p.slug order by p.puntaje desc, p.slug), '{}'::text[]),
    coalesce(jsonb_agg(jsonb_build_object('slug', p.slug, 'nombre', p.nombre, 'puntaje', p.puntaje) order by p.puntaje desc), '[]'::jsonb)
  into v_brigadas, v_puntajes
  from picked p;

  if coalesce(array_length(v_brigadas, 1), 0) = 0 then
    select array[b.slug], jsonb_build_array(jsonb_build_object(
      'slug', b.slug,
      'nombre', b.nombre,
      'puntaje', 1,
      'fallback', true
    ))
    into v_brigadas, v_puntajes
    from brigadas b
    where b.grupo = v.grupo
      and b.slug = 'social'
      and b.activa = true
    order by b.orden
    limit 1;

    if coalesce(array_length(v_brigadas, 1), 0) = 0 then
      select array[b.slug], jsonb_build_array(jsonb_build_object(
        'slug', b.slug,
        'nombre', b.nombre,
        'puntaje', 0,
        'fallback', true
      ))
      into v_brigadas, v_puntajes
      from brigadas b
      where b.grupo = v.grupo
        and b.activa = true
      order by b.orden
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'voluntario_id', v.id,
    'brigadas', coalesce(v_brigadas, '{}'::text[]),
    'puntajes', coalesce(v_puntajes, '[]'::jsonb),
    'texto_analizado', left(v_texto, 200)
  );
end;
$$;

create or replace function public.sugerir_brigadas_voluntario(
  p_voluntario_id uuid,
  p_max int default 2
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_grupo text;
begin
  select grupo into v_grupo from voluntarios where id = p_voluntario_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Voluntaria no encontrada');
  end if;

  if not (is_admin() or is_moderador_grupo(v_grupo) or _es_service_role()) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  return _sugerir_brigadas_voluntario_core(p_voluntario_id, p_max);
end;
$$;

create or replace function public.asignar_brigadas_por_fit_grupo(
  p_grupo text,
  p_solo_sin_brigadas boolean default true,
  p_max_por_voluntaria int default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_sug jsonb;
  v_brigadas text[];
  v_asignadas int := 0;
  v_omitidas int := 0;
  v_detalle jsonb := '[]'::jsonb;
begin
  if trim(coalesce(p_grupo, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta grupo');
  end if;

  if not (is_admin() or is_moderador_grupo(p_grupo) or _es_service_role()) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
  end if;

  for v in
    select id, numero_voluntaria, nombre, apellido, brigadas
    from voluntarios
    where grupo = p_grupo
      and activa = true
      and (
        not coalesce(p_solo_sin_brigadas, true)
        or coalesce(cardinality(brigadas), 0) = 0
      )
    order by numero_voluntaria
  loop
    v_sug := _sugerir_brigadas_voluntario_core(v.id, p_max_por_voluntaria);

    if coalesce(v_sug->>'ok', 'false') <> 'true' then
      v_omitidas := v_omitidas + 1;
      continue;
    end if;

    select coalesce(array_agg(x order by x), '{}'::text[])
    into v_brigadas
    from jsonb_array_elements_text(coalesce(v_sug->'brigadas', '[]'::jsonb)) as t(x);

    if coalesce(cardinality(v_brigadas), 0) = 0 then
      v_omitidas := v_omitidas + 1;
      continue;
    end if;

    update voluntarios
    set brigadas = v_brigadas
    where id = v.id;

    v_asignadas := v_asignadas + 1;
    v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
      'numero_voluntaria', v.numero_voluntaria,
      'nombre', v.nombre,
      'apellido', v.apellido,
      'brigadas', to_jsonb(v_brigadas),
      'puntajes', coalesce(v_sug->'puntajes', '[]'::jsonb)
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'grupo', p_grupo,
    'asignadas', v_asignadas,
    'omitidas', v_omitidas,
    'solo_sin_brigadas', coalesce(p_solo_sin_brigadas, true),
    'detalle', v_detalle
  );
end;
$$;

-- Backfill: censo importado sin brigadas (piloto Cuidadoras Caracas)
do $$
declare
  v_result jsonb;
begin
  v_result := asignar_brigadas_por_fit_grupo('cuidadoras_caracas', true, 2);
  raise notice 'asignar_brigadas_por_fit_grupo: %', v_result;
end;
$$;
