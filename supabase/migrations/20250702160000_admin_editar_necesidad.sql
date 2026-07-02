-- Admin: corregir teléfonos, direcciones y datos de contacto de solicitudes

create or replace function editar_necesidad(
  p_id uuid,
  p_nombre_contacto text,
  p_telefono text,
  p_whatsapp text,
  p_zona text,
  p_direccion_exacta text,
  p_lat double precision,
  p_lng double precision,
  p_descripcion text,
  p_urgencia text default null,
  p_source_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  if coalesce(trim(p_zona), '') = '' then
    raise exception 'La zona es obligatoria';
  end if;
  if coalesce(trim(p_direccion_exacta), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;
  if p_urgencia is not null and p_urgencia not in ('critica','urgente','normal') then
    raise exception 'Prioridad inválida';
  end if;

  update necesidades
    set
      nombre_contacto = coalesce(nullif(trim(p_nombre_contacto), ''), 'Vecino/a'),
      telefono = nullif(trim(p_telefono), ''),
      whatsapp = nullif(trim(p_whatsapp), ''),
      zona = trim(p_zona),
      direccion_exacta = trim(p_direccion_exacta),
      lat = p_lat,
      lng = p_lng,
      descripcion = coalesce(nullif(trim(p_descripcion), ''), descripcion),
      urgencia = coalesce(p_urgencia, urgencia),
      source_url = nullif(trim(p_source_url), '')
  where id = p_id
    and merged_into is null;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
end;
$$;

grant execute on function editar_necesidad(
  uuid, text, text, text, text, text, double precision, double precision, text, text, text
) to authenticated;
