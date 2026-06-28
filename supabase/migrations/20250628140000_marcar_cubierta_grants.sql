-- RPC de seguimiento voluntario + permisos PostgREST (idempotente)

alter table necesidades add column if not exists en_atencion_por text;
alter table necesidades add column if not exists en_atencion_at timestamptz;

create or replace function marcar_en_atencion(p_id uuid, p_telefono text)
returns void language plpgsql security definer set search_path = public as $$
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
returns void language plpgsql security definer set search_path = public as $$
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
returns void language plpgsql security definer set search_path = public as $$
begin
  update necesidades
  set estado = 'pendiente',
      en_atencion_por = null,
      en_atencion_at = null
  where id = p_id and estado = 'en_proceso';
end;
$$;

grant execute on function marcar_en_atencion(uuid, text) to anon, authenticated;
grant execute on function marcar_cubierta(uuid, text) to anon, authenticated;
grant execute on function liberar_atencion(uuid) to anon, authenticated;
