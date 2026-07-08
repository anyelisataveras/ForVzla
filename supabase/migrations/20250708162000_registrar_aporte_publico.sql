-- Inserta aportes públicos y, si dona un grupo, también registra transparencia por grupo.

create or replace function public.registrar_aporte_publico(
  p_necesidad_id uuid,
  p_tipo_aporte text,
  p_cantidad numeric default null,
  p_unidad text default null,
  p_descripcion text default null,
  p_dono_como text default 'persona',
  p_grupo_nombre text default null,
  p_donante_nombre text default null,
  p_donante_contacto text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aporte_id uuid;
  v_grupo_slug text;
  v_desc text := nullif(trim(coalesce(p_descripcion, '')), '');
  v_contacto text := nullif(trim(coalesce(p_donante_contacto, '')), '');
  v_donante text := nullif(trim(coalesce(p_donante_nombre, '')), '');
  v_grupo_nombre text := nullif(trim(coalesce(p_grupo_nombre, '')), '');
  v_tipo_grupo text;
begin
  if p_necesidad_id is null then
    raise exception 'Falta necesidad_id';
  end if;

  if p_tipo_aporte not in ('comida','medicinas','agua','refugio','dinero','transporte','voluntariado','insumos','otro') then
    raise exception 'tipo_aporte inválido';
  end if;

  if p_dono_como not in ('persona','institucion','grupo') then
    raise exception 'dono_como inválido';
  end if;

  if p_dono_como = 'grupo' and v_grupo_nombre is null then
    raise exception 'Falta nombre del grupo';
  end if;

  if p_dono_como = 'grupo' then
    v_grupo_slug := public.encontrar_o_crear_grupo_publico(v_grupo_nombre);
  end if;

  insert into public.aportes_necesidad (
    necesidad_id, tipo_aporte, cantidad, unidad, descripcion,
    dono_como, grupo_slug, donante_nombre, donante_contacto, estado
  )
  values (
    p_necesidad_id, p_tipo_aporte, p_cantidad, nullif(trim(coalesce(p_unidad, '')), ''), v_desc,
    p_dono_como, v_grupo_slug, v_donante, v_contacto, 'prometido'
  )
  returning id into v_aporte_id;

  if p_dono_como = 'grupo' and v_grupo_slug is not null then
    v_tipo_grupo := case p_tipo_aporte
      when 'dinero' then 'monetaria'
      when 'comida' then 'comida'
      when 'medicinas' then 'medicinas'
      else 'otro'
    end;

    insert into public.donaciones_grupo (
      grupo, tipo, cantidad, unidad, donante_nombre, donante_contacto,
      descripcion, destino
    )
    values (
      v_grupo_slug,
      v_tipo_grupo,
      p_cantidad,
      nullif(trim(coalesce(p_unidad, '')), ''),
      coalesce(v_donante, v_grupo_nombre),
      v_contacto,
      coalesce(v_desc, 'Aporte registrado desde flujo público'),
      'necesidad:' || p_necesidad_id::text
    );
  end if;

  return v_aporte_id;
end;
$$;

grant execute on function public.encontrar_o_crear_grupo_publico(text) to anon, authenticated;
grant execute on function public.registrar_aporte_publico(
  uuid, text, numeric, text, text, text, text, text, text
) to anon, authenticated;

