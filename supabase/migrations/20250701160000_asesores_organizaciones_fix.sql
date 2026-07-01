-- Corrige registros de Psicólogos sin Fronteras insertados sin tipo/pais

update asesores set
  tipo = 'organizacion',
  pais = 'Venezuela',
  telefonos = array[
    '0422-5103000','0424-3050678','0414-1154598','0412-3092701','0412-0941981',
    '0424-1430227','0414-2343695','0414-4673535','0426-5188343','0414-2489901','0412-7225080'
  ]::text[],
  telefono = '0422-5103000'
where nombre = 'Psicólogos sin Fronteras'
  and (tipo is distinct from 'organizacion' or pais is null or telefonos = '{}')
  and descripcion ilike '%trauma del terremoto%';

update asesores set tipo = 'organizacion', pais = 'México',
  telefonos = array['+58 414 2489901','+52 557 8101518','+52 577 1306447']::text[],
  telefono = '+58 414 2489901'
where nombre = 'Psicólogos sin Fronteras' and descripcion ilike '%México%'
  and (tipo is distinct from 'organizacion' or pais is null);

update asesores set tipo = 'organizacion', pais = 'Colombia',
  telefonos = array['+57 317 3786431','+57 310 4342528']::text[],
  telefono = '+57 317 3786431'
where nombre = 'Psicólogos sin Fronteras' and descripcion ilike '%Colombia%'
  and (tipo is distinct from 'organizacion' or pais is null);

update asesores set tipo = 'organizacion', pais = 'Estados Unidos',
  telefonos = array['+1 469 9157702','+1 832 7921044','+1 415 8404073']::text[],
  telefono = '+1 469 9157702'
where nombre = 'Psicólogos sin Fronteras' and descripcion ilike '%Estados Unidos%'
  and (tipo is distinct from 'organizacion' or pais is null);

update asesores set tipo = 'organizacion', pais = 'Argentina',
  telefonos = array['+54 911 33625870','+54 933 64679179']::text[],
  telefono = '+54 911 33625870'
where nombre = 'Psicólogos sin Fronteras' and descripcion ilike '%Argentina%'
  and (tipo is distinct from 'organizacion' or pais is null);

update asesores set tipo = 'organizacion', pais = 'Chile',
  telefonos = array['+56 990 011263']::text[],
  telefono = '+56 990 011263'
where nombre = 'Psicólogos sin Fronteras' and descripcion ilike '%Chile%'
  and (tipo is distinct from 'organizacion' or pais is null);

-- Re-ejecutar seed por si faltan países
insert into asesores (
  nombre, profesion, categoria, descripcion, modos, disponibilidad, idiomas,
  telefono, telefonos, tipo, pais, estado
)
select * from (values
  (
    'Psicólogos sin Fronteras', null, 'Psicológica',
    'Red de psicólogos voluntarios. Orientación emocional gratuita para quienes atraviesan el trauma del terremoto.',
    array['Llamada','WhatsApp']::text[], 'Consultar disponibilidad', 'Español',
    '0422-5103000',
    array[
      '0422-5103000','0424-3050678','0414-1154598','0412-3092701','0412-0941981',
      '0424-1430227','0414-2343695','0414-4673535','0426-5188343','0414-2489901','0412-7225080'
    ]::text[],
    'organizacion', 'Venezuela', 'activo'
  ),
  (
    'Psicólogos sin Fronteras', null, 'Psicológica',
    'Línea de apoyo para venezolanos en México y la región.',
    array['Llamada','WhatsApp']::text[], 'Consultar disponibilidad', 'Español',
    '+58 414 2489901',
    array['+58 414 2489901','+52 557 8101518','+52 577 1306447']::text[],
    'organizacion', 'México', 'activo'
  ),
  (
    'Psicólogos sin Fronteras', null, 'Psicológica',
    'Apoyo psicológico para la diáspora venezolana en Colombia.',
    array['Llamada','WhatsApp']::text[], 'Consultar disponibilidad', 'Español',
    '+57 317 3786431',
    array['+57 317 3786431','+57 310 4342528']::text[],
    'organizacion', 'Colombia', 'activo'
  ),
  (
    'Psicólogos sin Fronteras', null, 'Psicológica',
    'Orientación emocional para venezolanos en Estados Unidos.',
    array['Llamada','WhatsApp']::text[], 'Consultar disponibilidad', 'Español',
    '+1 469 9157702',
    array['+1 469 9157702','+1 832 7921044','+1 415 8404073']::text[],
    'organizacion', 'Estados Unidos', 'activo'
  ),
  (
    'Psicólogos sin Fronteras', null, 'Psicológica',
    'Apoyo psicológico para venezolanos en Argentina.',
    array['Llamada','WhatsApp']::text[], 'Consultar disponibilidad', 'Español',
    '+54 911 33625870',
    array['+54 911 33625870','+54 933 64679179']::text[],
    'organizacion', 'Argentina', 'activo'
  ),
  (
    'Psicólogos sin Fronteras', null, 'Psicológica',
    'Línea de apoyo para venezolanos en Chile.',
    array['Llamada','WhatsApp']::text[], 'Consultar disponibilidad', 'Español',
    '+56 990 011263',
    array['+56 990 011263']::text[],
    'organizacion', 'Chile', 'activo'
  )
) as v(nombre, profesion, categoria, descripcion, modos, disponibilidad, idiomas, telefono, telefonos, tipo, pais, estado)
where not exists (
  select 1 from asesores a
  where a.tipo = 'organizacion' and a.nombre = v.nombre and a.pais = v.pais
);
