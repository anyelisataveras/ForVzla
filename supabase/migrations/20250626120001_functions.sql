-- Funciones RPC: proximidad (Haversine) y antiduplicados

create or replace function _dist_m(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)
  ));
$$;

create or replace function necesidades_cercanas(
  p_lat double precision,
  p_lng double precision,
  p_radio_m double precision default 100000,
  p_tipo text default null
)
returns table (
  id uuid, zona text, direccion_exacta text, lat double precision, lng double precision,
  tipo text, tipos text[], subtipo text, urgencia text, descripcion text, cantidad text,
  nombre_contacto text, telefono text, whatsapp text, estado text, validada boolean,
  notas_coordinador text, confirmaciones int, fuente text, created_at timestamptz,
  distancia_m double precision
)
language sql stable as $$
  select n.id, n.zona, n.direccion_exacta, n.lat, n.lng, n.tipo, n.tipos, n.subtipo, n.urgencia,
         n.descripcion, n.cantidad, n.nombre_contacto, n.telefono, n.whatsapp, n.estado,
         n.validada, n.notas_coordinador, n.confirmaciones, n.fuente, n.created_at,
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

create or replace function confirmar_necesidad(p_id uuid)
returns void language sql as $$
  update necesidades set confirmaciones = confirmaciones + 1 where id = p_id;
$$;
