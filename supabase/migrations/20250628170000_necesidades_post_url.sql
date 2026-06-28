-- Necesidades de redes sin teléfono: usar null + source_url del post (IG/TikTok/etc.)

-- Limpiar placeholder legacy
update necesidades set telefono = null where telefono = 's/d';

-- Incluir source_url en RPC de proximidad (lista "Quiero ayudar" con GPS)
drop function if exists necesidades_cercanas(double precision, double precision, double precision, text);

create or replace function necesidades_cercanas(
  p_lat double precision,
  p_lng double precision,
  p_radio_m double precision default 100000,
  p_tipo text default null
)
returns table (
  id uuid, zona text, direccion_exacta text, lat double precision, lng double precision,
  tipo text, tipos text[], subtipo text, subtipos text[], otro text,
  urgencia text, descripcion text, cantidad text, personas_afectadas int,
  nombre_contacto text, telefono text, whatsapp text, estado text, validada boolean,
  notas_coordinador text, confirmaciones int, fuente text, source_url text, edificio_id uuid,
  en_atencion_por text, en_atencion_at timestamptz,
  created_at timestamptz, distancia_m double precision
)
language sql stable as $$
  select n.id, n.zona, n.direccion_exacta, n.lat, n.lng, n.tipo, n.tipos, n.subtipo, n.subtipos,
         n.otro, n.urgencia, n.descripcion, n.cantidad, n.personas_afectadas,
         n.nombre_contacto, n.telefono, n.whatsapp, n.estado, n.validada,
         n.notas_coordinador, n.confirmaciones, n.fuente, n.source_url, n.edificio_id,
         n.en_atencion_por, n.en_atencion_at, n.created_at,
         _dist_m(p_lat, p_lng, n.lat, n.lng) as distancia_m
  from necesidades n
  where n.estado <> 'cubierta'
    and n.merged_into is null
    and n.lat is not null and n.lng is not null
    and (
      p_tipo is null
      or n.tipo = p_tipo
      or (n.tipos is not null and p_tipo = any(n.tipos))
    )
    and _dist_m(p_lat, p_lng, n.lat, n.lng) <= p_radio_m
  order by distancia_m asc;
$$;

-- Al aprobar post de redes: sin teléfono → null (no 's/d'); URL del post ya va en source_url
create or replace function aprobar_post_redes(
  p_post_id uuid,
  p_destino text default 'necesidad'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p posts_redes%rowtype;
  v_dup_id uuid;
  v_nec_id uuid;
  v_edif_id uuid;
  v_tipo text;
  v_urg text;
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  if p_destino not in ('necesidad', 'edificio', 'ambos') then raise exception 'destino inválido'; end if;

  select * into p from posts_redes where id = p_post_id;
  if not found then raise exception 'Post no encontrado'; end if;
  if p.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'msg', 'Ya procesado: ' || p.estado);
  end if;

  v_tipo := case when p.categoria = 'rescate' then coalesce(nullif(p.tipo, ''), 'Rescate')
            else coalesce(nullif(p.tipo, ''), 'Otra') end;
  v_urg := case when p.urgencia in ('critica','urgente','normal') then p.urgencia else 'urgente' end;

  if p_destino in ('edificio', 'ambos') then
    if p.lat is null or p.lng is null then raise exception 'Faltan coordenadas para crear edificio'; end if;
    insert into edificios_colapsados (nombre, zona, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
    values (
      coalesce(nullif(p.direccion, ''), 'Edificio — ' || left(p.texto, 80)),
      coalesce(nullif(p.zona, ''), 'La Guaira'),
      p.lat, p.lng, 'colapsado', p.categoria = 'rescate', p.plataforma, left(p.texto, 500)
    ) returning id into v_edif_id;
  end if;

  if p_destino in ('necesidad', 'ambos') then
    if p.lat is not null and p.lng is not null then
      select nc.id into v_dup_id from necesidades_cercanas(p.lat, p.lng, 200, v_tipo) nc limit 1;
      if v_dup_id is not null then
        perform confirmar_necesidad(v_dup_id);
        update posts_redes set estado = 'aprobado', necesidad_id = v_dup_id, revisado_at = now() where id = p_post_id;
        return jsonb_build_object('ok', true, 'necesidad_id', v_dup_id, 'edificio_id', v_edif_id, 'accion', 'confirmado_existente');
      end if;
    end if;
    insert into necesidades (
      zona, direccion_exacta, lat, lng, tipo, urgencia, descripcion, cantidad,
      nombre_contacto, telefono, fuente, source_url, source_hash, validada, estado, edificio_id
    ) values (
      coalesce(nullif(p.zona, ''), 'Otra'),
      coalesce(nullif(p.direccion, ''), p.ubicacion_post, '(de ' || p.plataforma || ' @' || coalesce(p.usuario, '') || ')'),
      p.lat, p.lng, v_tipo, v_urg,
      coalesce(nullif(p.descripcion, ''), left(p.texto, 280)), p.cantidad,
      case when coalesce(p.usuario, '') <> '' then '@' || p.usuario else 'Reporte de redes' end,
      nullif(trim(coalesce(p.telefono, '')), ''),
      p.plataforma, p.url, p.source_hash, true, 'pendiente', v_edif_id
    ) returning id into v_nec_id;
  end if;

  update posts_redes set estado = 'aprobado', necesidad_id = coalesce(v_nec_id, necesidad_id), revisado_at = now()
  where id = p_post_id;
  return jsonb_build_object('ok', true, 'necesidad_id', v_nec_id, 'edificio_id', v_edif_id, 'accion', 'insertado');
end;
$$;
