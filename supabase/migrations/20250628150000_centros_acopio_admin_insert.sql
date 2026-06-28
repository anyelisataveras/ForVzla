-- Centros de acopio: RPC admin + grants PostgREST (idempotente)

alter table centros_acopio add column if not exists necesita_ahora text[] default '{}';
alter table centros_acopio add column if not exists ya_cubierto text[] default '{}';

grant select on table public.centros_acopio to anon, authenticated;
grant insert, update, delete on table public.centros_acopio to authenticated;

drop policy if exists "admin_insert_acopio" on centros_acopio;
drop policy if exists "admin_update_acopio" on centros_acopio;
drop policy if exists "admin_delete_acopio" on centros_acopio;

create policy "admin_insert_acopio" on centros_acopio
  for insert with check (is_admin());
create policy "admin_update_acopio" on centros_acopio
  for update using (is_admin());
create policy "admin_delete_acopio" on centros_acopio
  for delete using (is_admin());

create or replace function insertar_centro_acopio(
  p_nombre text,
  p_estado_vzla text,
  p_direccion text,
  p_lat double precision,
  p_lng double precision,
  p_organizacion text default null,
  p_telefono text default null,
  p_horario text default null,
  p_necesita_ahora text[] default '{}',
  p_ya_cubierto text[] default '{}',
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;
  if nullif(trim(p_nombre), '') is null
     or nullif(trim(p_estado_vzla), '') is null
     or nullif(trim(p_direccion), '') is null
     or p_lat is null or p_lng is null then
    raise exception 'Faltan campos obligatorios del centro';
  end if;

  insert into centros_acopio (
    nombre, organizacion, estado_vzla, direccion, lat, lng,
    telefono, horario, necesita_ahora, ya_cubierto, activo, notas
  ) values (
    trim(p_nombre),
    nullif(trim(coalesce(p_organizacion, '')), ''),
    trim(p_estado_vzla),
    trim(p_direccion),
    p_lat,
    p_lng,
    nullif(trim(coalesce(p_telefono, '')), ''),
    nullif(trim(coalesce(p_horario, '')), ''),
    coalesce(p_necesita_ahora, '{}'),
    coalesce(p_ya_cubierto, '{}'),
    true,
    nullif(trim(coalesce(p_notas, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function insertar_centro_acopio(
  text, text, text, double precision, double precision,
  text, text, text, text[], text[], text
) to authenticated;
