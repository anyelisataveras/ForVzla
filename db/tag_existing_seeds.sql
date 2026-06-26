-- ============================================================
-- Marcar seeds ya insertados (si corriste seed_data ANTES del tag __seed_v1__)
-- Ejecutar una vez en SQL Editor, luego usa purge_seed_data.sql al activar scraper.
-- ============================================================

update centros_acopio set notas = '__seed_v1__'
where notas is null and nombre in (
  'Iglesia La Paz Montalbán',
  'Iglesia San Bernardino de Siena',
  'Club Hípico de Caracas (Rotaract)',
  'Quinta El Bejucal – 4ta Av Altamira',
  'Torre Tamanaco Local 3 PB',
  'CC La Capilla Piso 1 Local 21',
  'Paseo de la Libertad – frente Centro Médico Maracay',
  'Esquina Banesco Av República',
  'Edif. Talislandia Mezzanina',
  'Tatas Food Barquisimeto',
  'Quinta Bejucal Altamira',
  'Calle 6 antigua Bermúdez',
  'Núcleo Táchira ULA',
  'Sede Un Nuevo Tiempo Zulia',
  'Sede Vente Zulia'
);

update edificios_colapsados set notas = '__seed_v1__'
where notas is null and zona = 'La Guaira' and fuente like 'Reporte ciudadano%';

update necesidades set notas_coordinador = '__seed_v1__'
where notas_coordinador is null
  and fuente = 'coordinador'
  and telefono in (
    '+58412111223', '+58414555001', '+58424999887',
    '+582518000001', '+58412777432', '+58241858444'
  );
