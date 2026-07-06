-- Moderadoras reales de Cuidadoras Caracas (grupo WA coordinación).
-- NO inserta voluntarias: ya están en el censo (formulario / import Excel).
-- Crea/actualiza usuario Auth + fila moderadores_grupo.
-- Contraseña inicial: vzla26 (cambiar después en Supabase Auth si hace falta).

create extension if not exists pgcrypto;

alter table moderadores_grupo
  add column if not exists voluntario_id uuid references voluntarios(id) on delete set null;

comment on column moderadores_grupo.voluntario_id is
  'Opcional: enlace a la ficha en voluntarios si la persona también está registrada como voluntaria.';

-- ── Auth: crear usuario si no existe, contraseña vzla26 ──
do $$
declare
  r record;
  v_uid uuid;
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_pass text := 'vzla26';
begin
  for r in
    select * from (values
      ('anyelisa.taveras@gmail.com', 'Angélisa Taveras'),
      ('campinsmc@gmail.com', 'María Cristina Campins')
    ) as t(email, nombre)
  loop
    select id into v_uid from auth.users where lower(email) = r.email;

    if v_uid is not null then
      update auth.users set
        encrypted_password = crypt(v_pass, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
      where id = v_uid;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        v_instance, v_uid, 'authenticated', 'authenticated', r.email,
        crypt(v_pass, gen_salt('bf')), now(), '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nombre', r.nombre),
        now(), now()
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_uid, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', r.email),
        'email', v_uid::text,
        now(), now(), now()
      )
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- ── Staff inicial del grupo (rol administrador se aplica en migración 20250706210000) ──
insert into moderadores_grupo (grupo, email, nombre, activo)
select v.grupo, v.email, v.nombre, true
from (values
  ('cuidadoras_caracas', 'anyelisa.taveras@gmail.com', 'Angélisa Taveras'),
  ('cuidadoras_caracas', 'campinsmc@gmail.com', 'María Cristina Campins')
) as v(grupo, email, nombre)
where not exists (
  select 1 from moderadores_grupo m
  where m.grupo = v.grupo and lower(m.email) = lower(v.email)
);

update moderadores_grupo m set nombre = v.nombre, activo = true
from (values
  ('cuidadoras_caracas', 'anyelisa.taveras@gmail.com', 'Angélisa Taveras'),
  ('cuidadoras_caracas', 'campinsmc@gmail.com', 'María Cristina Campins')
) as v(grupo, email, nombre)
where m.grupo = v.grupo and lower(m.email) = lower(v.email);

-- Enlazar administradora con ficha de voluntaria si existe
update moderadores_grupo m
set voluntario_id = v.id
from voluntarios v
where m.grupo = 'cuidadoras_caracas'
  and v.grupo = 'cuidadoras_caracas'
  and m.email = 'anyelisa.taveras@gmail.com'
  and (
    lower(replace(v.red_social_usuario, '@', '')) like '%anyelisataveras%'
    or v.nombre ilike 'Anyelisa%'
  );

-- ── Coordinadoras: las asignan las administradoras con asignar_coordinador_grupo ──
--
-- | Rol WA        | En censo (voluntarios)     | Instagram / contacto      |
-- |---------------|----------------------------|---------------------------|
-- | Dari          | Dariana Blanco (@darimbd)  | asignar_coordinador_grupo desde panel Equipo |
-- | Jeudy Arango  | (verificar en panel)       | +58 414-2614811           |
-- | Ren Zavala    | Renata Zavala (@rennzavala)| +52 55 5186 7957          |
-- | Wendy         | (verificar en panel)       | +58 424-6554932           |
-- | Cindy (logística) | Cindy Yotselin Rojas (@cyrojasl) | distinto al +56 del WA |
