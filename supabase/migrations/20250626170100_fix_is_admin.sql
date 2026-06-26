-- Fix: crear is_admin() y políticas admin (idempotente, corre solo si falló 20250626170000)

create table if not exists admin_users (
  email text primary key,
  nombre text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := coalesce(
    auth.jwt() ->> 'email',
    current_setting('request.jwt.claims', true)::json ->> 'email',
    ''
  );
  if v_email = '' then
    return false;
  end if;
  return exists (
    select 1 from admin_users au
    where lower(au.email) = lower(v_email)
  );
end;
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Primera administradora (edita o agrega más con el panel Equipo en admin.html)
insert into admin_users (email, nombre) values
  ('anyelisa.taveras@gmail.com', 'Anyelisa Taveras'),
  ('campinsmc@gmail.com', 'María Cristina Campins (Cris)')
on conflict (email) do update set nombre = excluded.nombre;

alter table admin_users enable row level security;

drop policy if exists "admin_read_admin_users" on admin_users;
drop policy if exists "admin_insert_admin_users" on admin_users;

create policy "admin_read_admin_users"
  on admin_users for select using (is_admin());
create policy "admin_insert_admin_users"
  on admin_users for insert with check (is_admin());

-- Centros y edificios
drop policy if exists "pub_insert_acopio" on centros_acopio;
drop policy if exists "pub_update_acopio" on centros_acopio;
drop policy if exists "admin_insert_acopio" on centros_acopio;
drop policy if exists "admin_update_acopio" on centros_acopio;
drop policy if exists "admin_delete_acopio" on centros_acopio;

create policy "admin_insert_acopio" on centros_acopio
  for insert with check (is_admin());
create policy "admin_update_acopio" on centros_acopio
  for update using (is_admin());
create policy "admin_delete_acopio" on centros_acopio
  for delete using (is_admin());

drop policy if exists "pub_insert_edificios" on edificios_colapsados;
drop policy if exists "pub_update_edificios" on edificios_colapsados;
drop policy if exists "admin_insert_edificios" on edificios_colapsados;
drop policy if exists "admin_update_edificios" on edificios_colapsados;
drop policy if exists "admin_delete_edificios" on edificios_colapsados;

create policy "admin_insert_edificios" on edificios_colapsados
  for insert with check (is_admin());
create policy "admin_update_edificios" on edificios_colapsados
  for update using (is_admin());
create policy "admin_delete_edificios" on edificios_colapsados
  for delete using (is_admin());

-- Posts (solo si la tabla existe)
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'posts_redes'
  ) then
    drop policy if exists "pub_update_posts_redes" on posts_redes;
    drop policy if exists "admin_update_posts_redes" on posts_redes;
    execute 'create policy "admin_update_posts_redes" on posts_redes for update using (is_admin())';
  end if;
end $$;

-- RPCs con auth (reemplazan versión PIN)
drop function if exists rechazar_post_redes(uuid, text, text);

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
      coalesce(nullif(p.telefono, ''), 's/d'),
      p.plataforma, p.url, p.source_hash, true, 'pendiente', v_edif_id
    ) returning id into v_nec_id;
  end if;

  update posts_redes set estado = 'aprobado', necesidad_id = coalesce(v_nec_id, necesidad_id), revisado_at = now()
  where id = p_post_id;
  return jsonb_build_object('ok', true, 'necesidad_id', v_nec_id, 'edificio_id', v_edif_id, 'accion', 'insertado');
end;
$$;

create or replace function rechazar_post_redes(p_post_id uuid, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  update posts_redes set estado = 'rechazado', notas_admin = coalesce(p_notas, notas_admin), revisado_at = now()
  where id = p_post_id and estado = 'pendiente';
  if not found then return jsonb_build_object('ok', false, 'msg', 'Post no encontrado o ya procesado'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function aprobar_post_redes(uuid, text) to authenticated;
grant execute on function rechazar_post_redes(uuid, text) to authenticated;
