-- Organizaciones de asesoría: una entidad por país, múltiples teléfonos

alter table asesores add column if not exists tipo text not null default 'persona'
  check (tipo in ('persona', 'organizacion'));
alter table asesores add column if not exists pais text;
alter table asesores add column if not exists telefonos text[] not null default '{}';

create index if not exists asesores_tipo_idx on asesores (tipo);
create index if not exists asesores_pais_idx on asesores (pais);

-- Psicólogos sin Fronteras — una fila por país (idempotente)
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
