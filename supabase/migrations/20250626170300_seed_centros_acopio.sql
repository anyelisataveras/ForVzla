-- Centros de acopio verificados — lista coordinación 26-jun-2026
-- Idempotente: inserta si falta, sincroniza dirección/org/estado si ya existe.

with seed(nombre, organizacion, estado_vzla, direccion, lat, lng) as (
  values
    -- Distrito Capital
    ('Iglesia La Paz Montalbán', '', 'Distrito Capital',
     'Iglesia La Paz, Montalbán 1, Municipio Libertador, Caracas',
     10.4812, -67.0021),
    ('Iglesia San Bernardino de Siena', '', 'Distrito Capital',
     'Parroquia San Bernardino, Caracas',
     10.5052, -66.9183),
    ('Club Hípico de Caracas (Rotaract)', 'Rotaract Caracas', 'Distrito Capital',
     'Terrazas del Club Hípico, Caracas',
     10.4302, -66.8851),
    -- Miranda
    ('Quinta El Bejucal – 4ta Av Altamira', 'Comando Con Venezuela', 'Miranda',
     '4ta Avenida de Altamira entre 9na y 10ma transversal, Quinta El Bejucal, Chacao',
     10.4950, -66.8482),
    ('Torre Tamanaco Local 3 PB', '', 'Miranda',
     'Torre Tamanaco, local 3 Planta Baja, Las Mercedes, Caracas',
     10.4802, -66.8582),
    -- Aragua
    ('CC La Capilla Piso 1 Local 21', 'Comando Con Venezuela', 'Aragua',
     'Centro Comercial La Capilla, piso 1 local 21, Av 19 de Abril, Maracay',
     10.2390, -67.5950),
    ('Paseo de la Libertad – frente Centro Médico Maracay', 'Voluntad Popular', 'Aragua',
     'Paseo de la Libertad, Av Las Delicias, frente al Centro Médico de Maracay',
     10.2441, -67.5965),
    -- Bolívar
    ('Esquina Banesco Av República', 'Voluntad Popular', 'Bolívar',
     'Esquina Banesco, Av República, Municipio Angostura del Orinoco, Ciudad Bolívar',
     8.1220, -63.5490),
    -- Carabobo
    ('Edif. Talislandia Mezzanina', 'Comando Con Venezuela / Operación Todos con Venezuela', 'Carabobo',
     'Edif. Talislandia, Mezzanina, Av Monseñor Adams, El Viñedo, Valencia',
     10.1627, -67.9935),
    -- Lara
    ('Tatas Food Barquisimeto', '', 'Lara',
     'Tatas Food, Carrera 15 entre calles 13A y 13B, Barquisimeto',
     10.0631, -69.3340),
    ('Quinta Bejucal Altamira', 'Comando Con Venezuela', 'Miranda',
     'Quinta Bejucal, 4ta Av de Altamira entre 9na y 10ma transversal, Chacao',
     10.4951, -66.8483),
    -- Monagas
    ('Calle 6 antigua Bermúdez', 'Voluntad Popular Monagas', 'Monagas',
     'Calle 6, antigua Bermúdez, casa N11, antiguo restaurante El Oeste, Maturín',
     9.7450, -63.1900),
    -- Táchira
    ('Núcleo Táchira ULA', 'Universidad de Los Andes', 'Táchira',
     'Núcleo Táchira, Universidad de Los Andes (ULA), San Cristóbal',
     7.7700, -72.2250),
    -- Zulia
    ('Sede Un Nuevo Tiempo Zulia', 'Un Nuevo Tiempo (UNT)', 'Zulia',
     'Sede regional Un Nuevo Tiempo, Maracaibo',
     10.6320, -71.6400),
    ('Sede Vente Zulia', 'Vente Venezuela', 'Zulia',
     'Sede Vente Zulia, Calle 70 con Av 15A y 15B N15A-39, Maracaibo',
     10.6501, -71.6142)
)
insert into centros_acopio (nombre, organizacion, estado_vzla, direccion, lat, lng, horario, notas)
select s.nombre, s.organizacion, s.estado_vzla, s.direccion, s.lat, s.lng,
       'Por confirmar', '__seed_centros_v1__'
from seed s
where not exists (
  select 1 from centros_acopio c where c.nombre = s.nombre
);

with seed(nombre, organizacion, estado_vzla, direccion, lat, lng) as (
  values
    ('Iglesia La Paz Montalbán', '', 'Distrito Capital',
     'Iglesia La Paz, Montalbán 1, Municipio Libertador, Caracas',
     10.4812, -67.0021),
    ('Iglesia San Bernardino de Siena', '', 'Distrito Capital',
     'Parroquia San Bernardino, Caracas',
     10.5052, -66.9183),
    ('Club Hípico de Caracas (Rotaract)', 'Rotaract Caracas', 'Distrito Capital',
     'Terrazas del Club Hípico, Caracas',
     10.4302, -66.8851),
    ('Quinta El Bejucal – 4ta Av Altamira', 'Comando Con Venezuela', 'Miranda',
     '4ta Avenida de Altamira entre 9na y 10ma transversal, Quinta El Bejucal, Chacao',
     10.4950, -66.8482),
    ('Torre Tamanaco Local 3 PB', '', 'Miranda',
     'Torre Tamanaco, local 3 Planta Baja, Las Mercedes, Caracas',
     10.4802, -66.8582),
    ('CC La Capilla Piso 1 Local 21', 'Comando Con Venezuela', 'Aragua',
     'Centro Comercial La Capilla, piso 1 local 21, Av 19 de Abril, Maracay',
     10.2390, -67.5950),
    ('Paseo de la Libertad – frente Centro Médico Maracay', 'Voluntad Popular', 'Aragua',
     'Paseo de la Libertad, Av Las Delicias, frente al Centro Médico de Maracay',
     10.2441, -67.5965),
    ('Esquina Banesco Av República', 'Voluntad Popular', 'Bolívar',
     'Esquina Banesco, Av República, Municipio Angostura del Orinoco, Ciudad Bolívar',
     8.1220, -63.5490),
    ('Edif. Talislandia Mezzanina', 'Comando Con Venezuela / Operación Todos con Venezuela', 'Carabobo',
     'Edif. Talislandia, Mezzanina, Av Monseñor Adams, El Viñedo, Valencia',
     10.1627, -67.9935),
    ('Tatas Food Barquisimeto', '', 'Lara',
     'Tatas Food, Carrera 15 entre calles 13A y 13B, Barquisimeto',
     10.0631, -69.3340),
    ('Quinta Bejucal Altamira', 'Comando Con Venezuela', 'Miranda',
     'Quinta Bejucal, 4ta Av de Altamira entre 9na y 10ma transversal, Chacao',
     10.4951, -66.8483),
    ('Calle 6 antigua Bermúdez', 'Voluntad Popular Monagas', 'Monagas',
     'Calle 6, antigua Bermúdez, casa N11, antiguo restaurante El Oeste, Maturín',
     9.7450, -63.1900),
    ('Núcleo Táchira ULA', 'Universidad de Los Andes', 'Táchira',
     'Núcleo Táchira, Universidad de Los Andes (ULA), San Cristóbal',
     7.7700, -72.2250),
    ('Sede Un Nuevo Tiempo Zulia', 'Un Nuevo Tiempo (UNT)', 'Zulia',
     'Sede regional Un Nuevo Tiempo, Maracaibo',
     10.6320, -71.6400),
    ('Sede Vente Zulia', 'Vente Venezuela', 'Zulia',
     'Sede Vente Zulia, Calle 70 con Av 15A y 15B N15A-39, Maracaibo',
     10.6501, -71.6142)
)
update centros_acopio c
set organizacion = s.organizacion,
    estado_vzla = s.estado_vzla,
    direccion = s.direccion,
    lat = s.lat,
    lng = s.lng,
    notas = coalesce(c.notas, '__seed_centros_v1__')
from seed s
where c.nombre = s.nombre;
