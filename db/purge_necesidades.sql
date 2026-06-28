-- ============================================================
-- Borrar TODAS las necesidades (deja edificios y centros intactos)
-- Ejecutar en Supabase > SQL Editor con cuidado (irreversible).
-- También: node scripts/purge_necesidades.js
-- ============================================================

update posts_redes set necesidad_id = null where necesidad_id is not null;
update necesidades set merged_into = null where merged_into is not null;
delete from necesidades;

select 'necesidades' as tabla, count(*) as restantes from necesidades;
