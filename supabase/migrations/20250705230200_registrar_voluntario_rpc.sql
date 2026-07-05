-- RPC público para registro (bypass RLS de insert con validación)
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
begin
  v_grupo := trim(coalesce(p_payload->>'grupo', ''));
  v_id_dni := trim(coalesce(p_payload->>'id_dni', ''));

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
    asistencia_zona, medio_transporte, observaciones_logistica
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
    nullif(trim(p_payload->>'observaciones_logistica'), '')
  )
  returning numero_voluntaria, id into v_numero, v_id;

  return jsonb_build_object('numero_voluntaria', v_numero, 'id', v_id);
end;
$$;

grant execute on function registrar_voluntario(jsonb) to anon, authenticated;

-- Por si la tabla se creó sin policy de insert directo
drop policy if exists "voluntarios_insert_publico" on voluntarios;
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

grant insert on table voluntarios to anon, authenticated;
