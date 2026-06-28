-- Arregla listado de admins (RLS consultaba auth.users sin permiso)
-- y permite invitar admins con contraseña temporal generada automáticamente.

create extension if not exists pgcrypto;

-- is_admin: solo JWT, sin leer auth.users
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
  v_email := lower(trim(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''),
    ''
  )));
  if v_email = '' then
    return false;
  end if;
  return exists (
    select 1 from admin_users au
    where lower(au.email) = v_email
  );
end;
$$;

grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admin_self_read" on admin_users;
create policy "admin_self_read"
  on admin_users for select
  using (
    lower(email) = lower(trim(coalesce(
      nullif(auth.jwt() ->> 'email', ''),
      ''
    )))
  );

-- Invitar admin: fila en admin_users + usuario Auth con contraseña temporal
create or replace function public.invitar_admin(
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
  if not is_admin() then
    raise exception 'No autorizado';
  end if;
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

  insert into admin_users (email, nombre)
  values (v_email, v_nombre)
  on conflict (email) do update
    set nombre = coalesce(excluded.nombre, admin_users.nombre);

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
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'password', v_pass,
    'nuevo', v_nuevo
  );
end;
$$;

grant execute on function public.invitar_admin(text, text) to authenticated;
