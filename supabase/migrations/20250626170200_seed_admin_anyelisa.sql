-- Administradoras iniciales
insert into admin_users (email, nombre) values
  ('anyelisa.taveras@gmail.com', 'Anyelisa Taveras'),
  ('campinsmc@gmail.com', 'María Cristina Campins (Cris)')
on conflict (email) do update set nombre = excluded.nombre;

-- Quitar placeholders de ejemplo si existían
delete from admin_users where email in ('anyelisa@example.com', 'cris@example.com');
