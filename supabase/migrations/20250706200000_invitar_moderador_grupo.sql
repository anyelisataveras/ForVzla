-- Invitar moderadora de grupo: Auth + fila moderadores_grupo (como invitar_admin).
-- Solo admin global o moderadora del mismo grupo (fase 2).

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
  v_pass text;
  v_uid uuid;
  v_nuevo boolean := false;
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not is_admin() and not is_moderador_grupo(v_grupo) then
    raise exception 'No autorizado';
  end if;
  if v_grupo = '' or not grupo_voluntarios_valido(v_grupo) then
    raise exception 'Grupo no válido';
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

  insert into moderadores_grupo (grupo, email, nombre, activo)
  values (v_grupo, v_email, v_nombre, true)
  on conflict (grupo, lower(email)) do update set
    nombre = coalesce(excluded.nombre, moderadores_grupo.nombre),
    activo = true;

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

  return jsonb_build_object(
    'ok', true,
    'grupo', v_grupo,
    'email', v_email,
    'password', v_pass,
    'nuevo', v_nuevo
  );
end;
$$;

grant execute on function public.invitar_moderador_grupo(text, text, text) to authenticated;
