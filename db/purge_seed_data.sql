-- ============================================================
-- Borrar datos semilla — ejecutar cuando el scraper esté activo
-- y la app ya reciba data real (IG/TikTok + reportes ciudadanos).
--
-- NO borra: fuente instagram | tiktok | ciudadano
-- SÍ borra: filas marcadas con __seed_v1__
-- ============================================================

-- 1) Necesidades de demostración (6 ejemplos coordinador)
delete from necesidades
where notas_coordinador = '__seed_v1__';

-- 2) Edificios y centros del seed (referencia aproximada)
delete from edificios_colapsados
where notas = '__seed_v1__';

delete from centros_acopio
where notas = '__seed_v1__';

-- Verificación rápida
select 'necesidades' as tabla, count(*) as restantes from necesidades
union all
select 'edificios_colapsados', count(*) from edificios_colapsados
union all
select 'centros_acopio', count(*) from centros_acopio;
