-- Permitir múltiples tipos de necesidad por reporte

alter table necesidades add column if not exists tipos text[];

update necesidades set tipos = array[tipo] where tipos is null;

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
