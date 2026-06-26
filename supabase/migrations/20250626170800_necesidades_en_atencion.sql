-- Seguimiento voluntario: quién va en camino y cuándo quedó atendida

alter table necesidades add column if not exists en_atencion_por text;
alter table necesidades add column if not exists en_atencion_at timestamptz;

create or replace function marcar_en_atencion(p_id uuid, p_telefono text)
returns void language plpgsql as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
  v_row necesidades%rowtype;
begin
  if v_tel is null then
    raise exception 'Falta teléfono del voluntario';
  end if;
  select * into v_row from necesidades where id = p_id for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if v_row.estado = 'cubierta' then
    raise exception 'Esta solicitud ya está atendida';
  end if;
  if v_row.estado = 'en_proceso'
     and v_row.en_atencion_por is not null
     and v_row.en_atencion_por <> v_tel then
    raise exception 'Otro voluntario ya va en camino';
  end if;
  update necesidades
  set estado = 'en_proceso',
      en_atencion_por = v_tel,
      en_atencion_at = now()
  where id = p_id;
end;
$$;

create or replace function marcar_cubierta(p_id uuid, p_telefono text default null)
returns void language plpgsql as $$
declare
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
  v_row necesidades%rowtype;
begin
  select * into v_row from necesidades where id = p_id for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if v_row.estado = 'cubierta' then
    return;
  end if;
  if v_tel is not null
     and v_row.en_atencion_por is not null
     and v_row.en_atencion_por <> v_tel then
    raise exception 'Solo quien va en camino puede marcarla atendida';
  end if;
  update necesidades set estado = 'cubierta' where id = p_id;
end;
$$;

create or replace function liberar_atencion(p_id uuid)
returns void language sql as $$
  update necesidades
  set estado = 'pendiente',
      en_atencion_por = null,
      en_atencion_at = null
  where id = p_id and estado = 'en_proceso';
$$;

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
  notas_coordinador text, confirmaciones int, fuente text, edificio_id uuid,
  en_atencion_por text, en_atencion_at timestamptz,
  created_at timestamptz, distancia_m double precision
)
language sql stable as $$
  select n.id, n.zona, n.direccion_exacta, n.lat, n.lng, n.tipo, n.tipos, n.subtipo, n.subtipos,
         n.otro, n.urgencia, n.descripcion, n.cantidad, n.personas_afectadas,
         n.nombre_contacto, n.telefono, n.whatsapp, n.estado, n.validada,
         n.notas_coordinador, n.confirmaciones, n.fuente, n.edificio_id,
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
