-- ============================================================
-- Borrar datos semilla — ejecutar cuando el scraper esté activo
-- y la app ya reciba data real (IG/TikTok + reportes ciudadanos).
--
-- También: node scraper/purge_seeds.js (usa service_role desde .env)
-- ============================================================

-- 1) Necesidades de demostración
delete from necesidades
where notas_coordinador = '__seed_v1__'
   or fuente = 'coordinador';

-- 2) Edificios y centros del seed (tablas 100% demo hoy)
delete from edificios_colapsados;
delete from centros_acopio;

-- Verificación rápida
select 'necesidades' as tabla, count(*) as restantes from necesidades
union all
select 'edificios_colapsados', count(*) from edificios_colapsados
union all
select 'centros_acopio', count(*) from centros_acopio;
