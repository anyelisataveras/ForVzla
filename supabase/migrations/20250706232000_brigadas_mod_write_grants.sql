-- Moderadoras pueden actualizar brigadas vía PostgREST (RLS mod_write_brigadas).
grant insert, update, delete on table brigadas to authenticated;
