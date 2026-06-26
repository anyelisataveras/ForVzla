-- Contraseña compartida del equipo admin: vzla26
-- Correr en Supabase Dashboard → SQL Editor
-- Requiere que los usuarios ya existan en Authentication (Auth → Users).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users
SET
  encrypted_password = crypt('vzla26', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
WHERE lower(email) IN (
  'anyelisa.taveras@gmail.com',
  'campinsmc@gmail.com'
);

-- Verifica cuántos se actualizaron (debe ser 2):
SELECT email, email_confirmed_at IS NOT NULL AS confirmado
FROM auth.users
WHERE lower(email) IN (
  'anyelisa.taveras@gmail.com',
  'campinsmc@gmail.com'
);
