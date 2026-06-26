-- Permite que un admin recién logueado lea SU fila en admin_users (verificación de acceso).
-- Corrige el ciclo: antes solo is_admin() podía leer la tabla, y is_admin a veces no veía el email del JWT.

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
    (select email from auth.users where id = auth.uid()),
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
      (select email from auth.users where id = auth.uid()),
      ''
    )))
  );
