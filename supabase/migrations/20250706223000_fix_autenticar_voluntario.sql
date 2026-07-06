-- Corrige login voluntaria cuando la función anterior quedó en estado inconsistente
-- y lanzaba: record "v" is not assigned yet

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
  v_voluntario record;
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

  select
    vv.id,
    vv.grupo,
    vv.numero_voluntaria,
    vv.nombre,
    vv.apellido,
    vv.brigadas,
    vv.red_social_plataforma,
    vv.red_social_usuario
  into v_voluntario
  from voluntarios vv
  where vv.grupo = trim(p_grupo)
    and vv.activa = true
    and coalesce(trim(vv.red_social_plataforma), '') ilike trim(p_plataforma)
    and _vol_usuario_norm(vv.red_social_usuario) = _vol_usuario_norm(p_usuario)
    and _vol_cedula4(vv.id_dni) = _vol_cedula4(p_cedula4)
  order by vv.numero_voluntaria asc nulls last, vv.created_at asc nulls last
  limit 1;

  if v_voluntario.id is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos tu registro. Revisa usuario y cédula, o regístrate.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'voluntario', jsonb_build_object(
      'id', v_voluntario.id,
      'grupo', v_voluntario.grupo,
      'numero_voluntaria', v_voluntario.numero_voluntaria,
      'nombre', v_voluntario.nombre,
      'apellido', v_voluntario.apellido,
      'brigadas', coalesce(v_voluntario.brigadas, '{}'::text[]),
      'red_social_plataforma', v_voluntario.red_social_plataforma,
      'red_social_usuario', v_voluntario.red_social_usuario
    )
  );
end;
$$;

grant execute on function public.autenticar_voluntario(text, text, text, text) to anon, authenticated;
