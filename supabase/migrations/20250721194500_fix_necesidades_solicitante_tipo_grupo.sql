-- Fix: necesidades_solicitante_tipo_check may exist without 'grupo'
-- (earlier add-if-not-exists left a persona/sitio-only check in place).

alter table public.necesidades
  drop constraint if exists necesidades_solicitante_tipo_check;

alter table public.necesidades
  add constraint necesidades_solicitante_tipo_check
  check (solicitante_tipo in ('persona', 'sitio', 'grupo'));
