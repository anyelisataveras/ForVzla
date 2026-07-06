-- Roles de staff por grupo:
--   administrador — lo crea ForVzla al dar de alta el grupo; gestiona coordinadores
--   coordinador   — lo asigna un administrador desde voluntarias ya registradas
--
-- Tabla moderadores_grupo = staff del grupo (ambos roles). Nombre histórico; ver columna rol.

alter table moderadores_grupo
  add column if not exists rol text;

update moderadores_grupo
set rol = 'coordinador'
where rol is null;

alter table moderadores_grupo
  alter column rol set default 'coordinador',
  alter column rol set not null;

alter table moderadores_grupo drop constraint if exists moderadores_grupo_rol_check;
alter table moderadores_grupo
  add constraint moderadores_grupo_rol_check
  check (rol in ('administrador', 'coordinador'));

comment on column moderadores_grupo.rol is
  'administrador: creado por ForVzla; coordinador: asignado por admin del grupo desde voluntarios';

comment on column moderadores_grupo.voluntario_id is
  'Coordinadores: enlace obligatorio vía asignar_coordinador_grupo. Administradores: opcional.';

create index if not exists moderadores_grupo_voluntario_idx
  on moderadores_grupo (voluntario_id)
  where voluntario_id is not null;

-- ── Helpers de rol ──

create or replace function public.is_administrador_grupo(p_grupo text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1 from moderadores_grupo m
      where m.activo = true
        and m.rol = 'administrador'
        and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (p_grupo is null or m.grupo = p_grupo)
    );
$$;

grant execute on function public.is_administrador_grupo(text) to anon, authenticated;

create or replace function public.is_coordinador_grupo(p_grupo text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_administrador_grupo(p_grupo)
    or exists (
      select 1 from moderadores_grupo m
      where m.activo = true
        and m.rol = 'coordinador'
        and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (p_grupo is null or m.grupo = p_grupo)
    );
$$;

grant execute on function public.is_coordinador_grupo(text) to anon, authenticated;

-- Alias histórico: staff con acceso al panel (admin o coord del grupo)
create or replace function public.is_moderador_grupo(p_grupo text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_coordinador_grupo(p_grupo);
$$;

create or replace function public.puede_acceder_coord(p_grupo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_coordinador_grupo(p_grupo);
$$;

create or replace function public.puede_administrar_grupo(p_grupo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_administrador_grupo(p_grupo);
$$;

grant execute on function public.puede_administrar_grupo(text) to authenticated;

-- ── Auth bootstrap (mismo patrón que invitar_admin) ──

create or replace function public._staff_grupo_auth_upsert(
  p_email text,
  p_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_nombre text := nullif(trim(p_nombre), '');
  v_pass text;
  v_uid uuid;
  v_nuevo boolean := false;
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_email = '' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Correo inválido';
  end if;

  v_pass := array_to_string(
    array(
      select substr('abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 57)::int + 1, 1)
      from generate_series(1, 10)
    ),
    ''
  );

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    update auth.users set
      encrypted_password = crypt(v_pass, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    where id = v_uid;
  else
    v_nuevo := true;
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_instance, v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_pass, gen_salt('bf')), now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      coalesce(jsonb_build_object('nombre', v_nombre), '{}'::jsonb),
      now(), now()
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      v_uid, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email', v_uid::text,
      now(), now(), now()
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object('email', v_email, 'password', v_pass, 'nuevo', v_nuevo);
end;
$$;

-- ForVzla: administrador de grupo (correo + Auth)
create or replace function public.invitar_administrador_grupo(
  p_grupo text,
  p_email text,
  p_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_grupo text := trim(coalesce(p_grupo, ''));
  v_email text := lower(trim(p_email));
  v_nombre text := nullif(trim(p_nombre), '');
  v_auth jsonb;
begin
  if not is_admin() then
    raise exception 'Solo el equipo ForVzla puede crear administradores de grupo';
  end if;
  if v_grupo = '' or not grupo_voluntarios_valido(v_grupo) then
    raise exception 'Grupo no válido';
  end if;

  insert into moderadores_grupo (grupo, email, nombre, rol, activo)
  values (v_grupo, v_email, v_nombre, 'administrador', true)
  on conflict (grupo, lower(email)) do update set
    nombre = coalesce(excluded.nombre, moderadores_grupo.nombre),
    rol = 'administrador',
    activo = true;

  v_auth := _staff_grupo_auth_upsert(v_email, v_nombre);

  return jsonb_build_object(
    'ok', true,
    'grupo', v_grupo,
    'rol', 'administrador',
    'email', v_auth->>'email',
    'password', v_auth->>'password',
    'nuevo', v_auth->>'nuevo'
  );
end;
$$;

grant execute on function public.invitar_administrador_grupo(text, text, text) to authenticated;

-- Admin del grupo: coordinador desde voluntaria existente
create or replace function public.asignar_coordinador_grupo(
  p_grupo text,
  p_voluntario_id uuid,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_grupo text := trim(coalesce(p_grupo, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nombre text;
  v_auth jsonb;
  v_vol record;
begin
  if not is_admin() and not is_administrador_grupo(v_grupo) then
    raise exception 'Solo administradores del grupo pueden asignar coordinadores';
  end if;
  if v_grupo = '' or not grupo_voluntarios_valido(v_grupo) then
    raise exception 'Grupo no válido';
  end if;
  if p_voluntario_id is null then
    raise exception 'Falta voluntaria';
  end if;

  select v.id, v.nombre, v.apellido, v.grupo, v.red_social_plataforma, v.red_social_usuario
  into v_vol
  from voluntarios v
  where v.id = p_voluntario_id and v.grupo = v_grupo and v.activa is not false;

  if v_vol.id is null then
    raise exception 'Voluntaria no encontrada en este grupo';
  end if;

  v_nombre := trim(v_vol.nombre || ' ' || coalesce(v_vol.apellido, ''));

  if v_email = '' then
    if lower(coalesce(v_vol.red_social_plataforma, '')) = 'gmail'
       and coalesce(v_vol.red_social_usuario, '') ~ '^[^@]+@[^@]+\.[^@]+$' then
      v_email := lower(trim(v_vol.red_social_usuario));
    end if;
  end if;

  if v_email = '' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'La voluntaria necesita un correo (Gmail en el registro o pásalo al asignar)';
  end if;

  insert into moderadores_grupo (grupo, email, nombre, rol, voluntario_id, activo)
  values (v_grupo, v_email, v_nombre, 'coordinador', v_vol.id, true)
  on conflict (grupo, lower(email)) do update set
    nombre = excluded.nombre,
    rol = 'coordinador',
    voluntario_id = excluded.voluntario_id,
    activo = true;

  v_auth := _staff_grupo_auth_upsert(v_email, v_nombre);

  return jsonb_build_object(
    'ok', true,
    'grupo', v_grupo,
    'rol', 'coordinador',
    'voluntario_id', v_vol.id,
    'email', v_auth->>'email',
    'password', v_auth->>'password',
    'nuevo', v_auth->>'nuevo'
  );
end;
$$;

grant execute on function public.asignar_coordinador_grupo(text, uuid, text) to authenticated;

-- Listar staff del grupo (admin ForVzla o administrador del grupo)
create or replace function public.listar_staff_grupo(p_grupo text)
returns table (
  id uuid,
  email text,
  nombre text,
  rol text,
  activo boolean,
  voluntario_id uuid,
  voluntario_nombre text,
  voluntario_numero int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.email,
    m.nombre,
    m.rol,
    m.activo,
    m.voluntario_id,
    trim(coalesce(v.nombre, '') || ' ' || coalesce(v.apellido, '')) as voluntario_nombre,
    v.numero_voluntaria
  from moderadores_grupo m
  left join voluntarios v on v.id = m.voluntario_id
  where m.grupo = trim(p_grupo)
    and (is_admin() or is_administrador_grupo(p_grupo))
  order by case m.rol when 'administrador' then 0 else 1 end, m.nombre;
$$;

grant execute on function public.listar_staff_grupo(text) to authenticated;

-- Revocar acceso (no quita la ficha de voluntaria)
create or replace function public.revocar_staff_grupo(p_grupo text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo text := trim(coalesce(p_grupo, ''));
  v_email text := lower(trim(p_email));
  v_rol text;
begin
  select m.rol into v_rol
  from moderadores_grupo m
  where m.grupo = v_grupo and lower(m.email) = v_email;

  if v_rol is null then
    return false;
  end if;

  if v_rol = 'administrador' and not is_admin() then
    raise exception 'Solo ForVzla puede quitar administradores';
  end if;

  if not is_admin() and not is_administrador_grupo(v_grupo) then
    raise exception 'No autorizado';
  end if;

  update moderadores_grupo
  set activo = false
  where grupo = v_grupo and lower(email) = v_email;

  return true;
end;
$$;

grant execute on function public.revocar_staff_grupo(text, text) to authenticated;

-- invitar_moderador_grupo → solo administradores de grupo; crea coordinador sin voluntario_id (legacy)
create or replace function public.invitar_moderador_grupo(
  p_grupo text,
  p_email text,
  p_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_grupo text := trim(coalesce(p_grupo, ''));
  v_email text := lower(trim(p_email));
  v_nombre text := nullif(trim(p_nombre), '');
  v_auth jsonb;
begin
  if not is_admin() and not is_administrador_grupo(v_grupo) then
    raise exception 'No autorizado';
  end if;
  if v_grupo = '' or not grupo_voluntarios_valido(v_grupo) then
    raise exception 'Grupo no válido';
  end if;

  insert into moderadores_grupo (grupo, email, nombre, rol, activo)
  values (v_grupo, v_email, v_nombre, 'coordinador', true)
  on conflict (grupo, lower(email)) do update set
    nombre = coalesce(excluded.nombre, moderadores_grupo.nombre),
    rol = 'coordinador',
    activo = true;

  v_auth := _staff_grupo_auth_upsert(v_email, v_nombre);

  return jsonb_build_object(
    'ok', true,
    'grupo', v_grupo,
    'rol', 'coordinador',
    'email', v_auth->>'email',
    'password', v_auth->>'password',
    'nuevo', v_auth->>'nuevo',
    'aviso', 'Preferir asignar_coordinador_grupo desde una voluntaria registrada'
  );
end;
$$;

-- RLS: administradores del grupo ven todo el staff
drop policy if exists "admin_grupo_read_staff" on moderadores_grupo;
create policy "admin_grupo_read_staff"
  on moderadores_grupo for select
  using (
    is_admin()
    or is_administrador_grupo(grupo)
    or (
      activo = true
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Cuidadoras Caracas: Angélisa y Cris son administradoras (no coordinadoras sueltas)
update moderadores_grupo
set rol = 'administrador'
where grupo = 'cuidadoras_caracas'
  and lower(email) in ('anyelisa.taveras@gmail.com', 'campinsmc@gmail.com');
