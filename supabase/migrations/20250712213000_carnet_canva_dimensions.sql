-- Dimensiones impresión Canva Cuidadoras: 7×5 pulgadas (177.8×127 mm).

update carnet_plantillas
set config = config || jsonb_build_object(
  'dimensions', jsonb_build_object(
    'width_mm', 177.8,
    'height_mm', 127,
    'width_in', 7,
    'height_in', 5,
    'source', 'Canva template Renata Zavala / Flor Guerrero export 2026-07-12'
  ),
  'template_slug', 'cuidadoras_caracas_v2'
),
version = version + 1,
updated_at = now()
where grupo = 'cuidadoras_caracas';
