-- Moderadoras por grupo + RLS PII voluntarios (CC-110)

create table if not exists moderadores_grupo (
  id         uuid primary key default gen_random_uuid(),
  grupo      text not null,
  email      text not null,
  nombre     text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists moderadores_grupo_grupo_email_idx
  on moderadores_grupo (grupo, lower(email));

create index if not exists moderadores_grupo_grupo_idx on moderadores_grupo (grupo);

alter table moderadores_grupo enable row level security;

create policy "admin_all_moderadores_grupo"
  on moderadores_grupo for all
  using (is_admin())
  with check (is_admin());

-- Moderadora puede verificar su propio acceso (solo su fila)
create policy "mod_read_self_moderadores"
  on moderadores_grupo for select
  using (
    activo = true
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create or replace function public.is_moderador_grupo(p_grupo text default null)
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
        and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (p_grupo is null or m.grupo = p_grupo)
    );
$$;

grant execute on function public.is_moderador_grupo(text) to anon, authenticated;

create or replace function public.puede_acceder_coord(p_grupo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_moderador_grupo(p_grupo);
$$;

grant execute on function public.puede_acceder_coord(text) to authenticated;

-- Voluntarios: moderadoras del grupo leen y editan PII
drop policy if exists "admin_read_voluntarios" on voluntarios;
drop policy if exists "admin_update_voluntarios" on voluntarios;
drop policy if exists "admin_delete_voluntarios" on voluntarios;

create policy "mod_read_voluntarios"
  on voluntarios for select
  using (is_admin() or is_moderador_grupo(grupo));

create policy "mod_update_voluntarios"
  on voluntarios for update
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

create policy "mod_delete_voluntarios"
  on voluntarios for delete
  using (is_admin());

grant select, update on table voluntarios to authenticated;

-- Sitios: moderadoras del grupo (además de admin)
drop policy if exists "admin_all_sitios" on sitios;

create policy "mod_all_sitios"
  on sitios for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

-- Brigadas: moderadoras pueden actualizar coordinadoras
drop policy if exists "pub_read_brigadas" on brigadas;
drop policy if exists "admin_all_brigadas" on brigadas;

create policy "pub_read_brigadas"
  on brigadas for select
  using (activa = true or is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_brigadas"
  on brigadas for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

-- Jornadas: moderadoras gestionan; público solo abiertas
drop policy if exists "pub_read_jornadas_abiertas" on jornadas;
drop policy if exists "admin_all_jornadas" on jornadas;

create policy "pub_read_jornadas_abiertas"
  on jornadas for select
  using (estado in ('abierta','llena','realizada') or is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_jornadas"
  on jornadas for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

-- Alta moderadoras: insertar en SQL Editor con correos reales, ej.:
-- insert into moderadores_grupo (grupo, email, nombre) values
--   ('cuidadoras_caracas', 'dari@correo.com', 'Dari')
-- on conflict (grupo, lower(email)) do update set activo = true;
-- Luego crear el mismo correo en Supabase Auth → Users.
