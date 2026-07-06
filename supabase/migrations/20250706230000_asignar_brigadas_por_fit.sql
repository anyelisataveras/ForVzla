-- Asignación de brigadas por afinidad de perfil (sin IA).
-- Usa profesión, oficio, tareas, fortalezas y señales logísticas.
-- Las voluntarias pueden cambiar después en mi-cuenta.

create or replace function public._vol_texto_fit(
  p_profesion text,
  p_oficio text,
  p_tareas text,
  p_fortalezas text,
  p_obs text
)
returns text
language sql
immutable
as $$
  select lower(
    translate(
      coalesce(p_profesion, '') || ' ' ||
      coalesce(p_oficio, '') || ' ' ||
      coalesce(p_tareas, '') || ' ' ||
      coalesce(p_fortalezas, '') || ' ' ||
      coalesce(p_obs, ''),
      'áéíóúàèìòùñüÁÉÍÓÚÀÈÌÒÙÑÜ',
      'aeiouaeiounuaeiouaeiounu'
    )
  );
$$;

create or replace function public._puntaje_brigada_fit(
  p_texto text,
  p_slug text,
  p_tiene_hijos text,
  p_transporte text
)
returns int
language plpgsql
immutable
as $$
declare
  score int := 0;
begin
  case p_slug
    when 'logistica_alimentos' then
      if p_texto ~ '(chef|cocin|gastron|aliment|nutric|pasteler|panader|comida|culinar|reposter|gastronomi|cheff)' then
        score := score + 10;
      end if;
      if p_transporte in ('carro', 'camioneta') then score := score + 2; end if;

    when 'salud_medicamentos' then
      if p_texto ~ '(medic|enfermer|doctor|odontolog|farmac|salud|fisioterap|paramed|bioanal|laborator|odontol|enfermeria|obstetr|pediatr|auxiliar)' then
        score := score + 10;
      end if;
      if p_texto ~ '(primeros auxilios|primer auxilio)' then score := score + 6; end if;

    when 'clasificacion_donaciones' then
      if p_texto ~ '(costur|modist|organiz|inventar|almacen|clasific|donacion|ropa|textil|bodega|comercio)' then
        score := score + 10;
      end if;
      if p_texto ~ '(logist|distribuc)' then score := score + 4; end if;

    when 'saneamiento' then
      if p_texto ~ '(limpiez|aseo|mantenim|higien|conserj|jardiner|aseador|servicio general)' then
        score := score + 10;
      end if;
      if p_texto ~ '(orden|organizacion del hogar)' then score := score + 4; end if;

    when 'recreacion' then
      if p_texto ~ '(educacion|maestr|profesor|preescolar|infantil|nino|nina|recreacion|deport|pedagog|puericultor|docent|guarderi|animador|lic\.?\s*educ)' then
        score := score + 10;
      end if;
      if coalesce(lower(trim(p_tiene_hijos)), '') in ('si', 'sí', 'yes') then
        score := score + 3;
      end if;
      if p_texto ~ '(experiencia con nino|trabajo con nino|ama de casa)' then
        score := score + 4;
      end if;

    when 'contencion' then
      if p_texto ~ '(psicolog|psiquiatr|trabajador social|terapeuta|contencion|escucha|emocional|consejer|psico|consejeria|trabajo social)' then
        score := score + 10;
      end if;
      if coalesce(lower(trim(p_tiene_hijos)), '') in ('si', 'sí', 'yes') then
        score := score + 2;
      end if;

    when 'social' then
      if p_texto ~ '(sociolog|administr|gestion|abogad|derecho|comunicacion|relaciones public|recursos humanos|trabajo comunitario|orientacion)' then
        score := score + 8;
      end if;
      -- Brigada universal: puntaje base para desempate
      score := score + 1;

    else
      score := 0;
  end case;

  return score;
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

  if not (is_admin() or is_moderador_grupo(v.grupo)) then
    return jsonb_build_object('ok', false, 'error', 'Sin permiso');
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

grant execute on function public.sugerir_brigadas_voluntario(uuid, int) to authenticated;

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

  if not (is_admin() or is_moderador_grupo(p_grupo)) then
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
    v_sug := sugerir_brigadas_voluntario(v.id, p_max_por_voluntaria);

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

grant execute on function public.asignar_brigadas_por_fit_grupo(text, boolean, int) to authenticated;
