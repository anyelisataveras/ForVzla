-- Fix: resumen_media_jornadas_voluntario referenciaba CTEs valid/ranked fuera de scope → 500 al cargar listado.

create or replace function public.resumen_media_jornadas_voluntario(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_jornada_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths text[];
  v_result jsonb;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if p_jornada_ids is null or cardinality(p_jornada_ids) = 0 then
    return jsonb_build_object('ok', true, 'jornadas', '[]'::jsonb);
  end if;

  with valid as (
    select j.id
    from jornadas j
    where j.id = any(p_jornada_ids)
      and j.grupo = trim(p_grupo)
      and j.estado in ('abierta', 'llena', 'realizada')
  ),
  counts as (
    select m.jornada_id, count(*)::int as total
    from jornada_media m
    join valid v on v.id = m.jornada_id
    group by m.jornada_id
  ),
  ranked as (
    select
      m.jornada_id,
      m.id,
      m.media_type,
      m.storage_path,
      row_number() over (partition by m.jornada_id order by m.created_at desc) as rn
    from jornada_media m
    join valid v on v.id = m.jornada_id
  ),
  previews as (
    select
      jornada_id,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'media_type', media_type,
          'storage_path', storage_path
        ) order by rn
      ) as items
    from ranked
    where rn <= 3
    group by jornada_id
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'jornada_id', c.jornada_id,
            'total', c.total,
            'previews', coalesce(p.items, '[]'::jsonb)
          )
        )
        from counts c
        left join previews p on p.jornada_id = c.jornada_id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (select array_agg(distinct r.storage_path) from ranked r where r.rn <= 3),
      array[]::text[]
    )
  into v_result, v_paths;

  perform public._emit_jornada_media_read_tokens(p_voluntario_id, v_paths);

  return jsonb_build_object('ok', true, 'jornadas', v_result);
end;
$$;
