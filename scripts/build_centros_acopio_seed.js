#!/usr/bin/env node
/**
 * Parsea lista de acopios, geocodifica (Nominatim 1 req/s) y emite SQL idempotente.
 * Uso: node scripts/build_centros_acopio_seed.js > /tmp/seed.sql
 */
import { geocode } from '../scraper/lib/geocode.js';

const EXISTING_NAMES = new Set([
  'Iglesia La Paz Montalbán', 'Iglesia San Bernardino de Siena',
  'Club Hípico de Caracas (Rotaract)', 'Quinta El Bejucal – 4ta Av Altamira',
  'Torre Tamanaco Local 3 PB', 'CC La Capilla Piso 1 Local 21',
  'Paseo de la Libertad – frente Centro Médico Maracay', 'Esquina Banesco Av República',
  'Edif. Talislandia Mezzanina', 'Tatas Food Barquisimeto', 'Quinta Bejucal Altamira',
  'Calle 6 antigua Bermúdez', 'Núcleo Táchira ULA', 'Sede Un Nuevo Tiempo Zulia',
  'Sede Vente Zulia',
]);

const FOREIGN = [
  /sarasota/i, /siesta key/i, /samoset/i, /trailer estates/i,
  /kensington park/i, /biscayne/i, /little river/i, /duluth,\s*ga/i, /estados unidos/i,
  /,\s*florida\s+\d{5}/i, /florida 34237/i, /trail.*sarasota/i,
  /sevilla,\s*espa/i, /casco antiguo de sevilla/i, /alicante/i, /cuenca.*ecuador/i, /yanuncay/i,
  /apoquindo/i, /providencia 1669/i, /antioquia,\s*colombia/i, /itagui/i,
  /palermo pac[ií]fico/i, /manuel ugarte/i, /humboldt,/i, /mall itagui/i,
  /georgia 30096/i, /alcald[ií]a de panam[aá]/i, /calle 35,\s*calidonia/i,
];

/** @type {{nombre:string, direccion:string, estado_vzla:string, horario:string, org:string}[]} */
const RAW = [
  { nombre: 'ISO HOME Prebo', direccion: 'Urbanización Carabobo, Prebo, Valencia', estado_vzla: 'Carabobo', horario: '', org: 'ISO HOME' },
  { nombre: 'ISO HOME El Nepe', direccion: 'Supermercados TIO, Carretera Nacional Valencia-Guacara, Zona Industrial El Nepe', estado_vzla: 'Carabobo', horario: '', org: 'ISO HOME' },
  { nombre: 'La Sagrada Familia', direccion: 'Pasaje 13, Las Acacias, Maracay', estado_vzla: 'Aragua', horario: '', org: '' },
  { nombre: 'Centro de Acopio Iglú Moda', direccion: 'Avenida Roosevelt, Urbanización Nuevo Prado, Los Castaños, Maracay', estado_vzla: 'Aragua', horario: '', org: '' },
  { nombre: 'Rock and Rolls Fit', direccion: '7.ª Avenida de Catia, Pérez Bonalde, Catia, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: 'Gym' },
  { nombre: 'Páramo Qta Crespo', direccion: 'Avenida Oeste 18, San Martín, Barrio El Guarataro, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: '' },
  { nombre: 'Bullking Qta Crespo', direccion: 'Bullking, Avenida Oeste 20, San Martín, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: 'Bullking' },
  { nombre: 'Bullking Paraíso', direccion: 'Bullking, Avenida José Antonio Páez, Barrio Sinaí, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: 'Bullking' },
  { nombre: 'Bullking Antímano', direccion: 'Calle del Medio, Barrio La Cumbre, Mamera, Caracas', estado_vzla: 'Distrito Capital', horario: '8AM-5PM', org: 'Bullking' },
  { nombre: 'U.E.N. Ramón Isidro Montes', direccion: 'U.E.N. Ramón Isidro Montes, Calle Colombia, Pérez Bonalde, Caracas', estado_vzla: 'Distrito Capital', horario: '8am-5pm', org: '' },
  { nombre: 'Iglesia Catedral Proclamación', direccion: 'Catedral Proclamación, Av. Hermán Garmendia, Las Trinitarias, Barquisimeto', estado_vzla: 'Lara', horario: '24 horas', org: '' },
  { nombre: 'Acopio Parroquia Coche', direccion: 'Av. Miguel Otero Silva, Iglesia Santo Domingo Savio, Coche, Caracas', estado_vzla: 'Distrito Capital', horario: 'Lun-Dom 8:00-20:00', org: '' },
  { nombre: 'Casa Verde Cincoxciento', direccion: 'Uozo Sano y Sabroso, 27A 21, Calle 42, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: '' },
  { nombre: 'Shopping Espacial Piso 2', direccion: 'Farmacia Popular, Avenida Bolívar, Urbanización Doña Elvira, San Juan de los Morros', estado_vzla: 'Guárico', horario: '2pm-8pm', org: '' },
  { nombre: 'INTT San Juan de los Morros', direccion: 'Redoma de La Bandera, Urbanización La Tropical 1, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: 'INTT' },
  { nombre: 'Farmatodo María de los Ángeles', direccion: 'Farmatodo, Avenida Fermín Toro, Barrio María de los Ángeles, Barinas', estado_vzla: 'Barinas', horario: '', org: 'Farmatodo' },
  { nombre: 'Estación de Servicio Pariapan', direccion: 'E/S Pariapan, Avenida Fermín Toro, Barrio María de los Ángeles, Barinas', estado_vzla: 'Barinas', horario: '', org: '' },
  { nombre: 'Alcaldía Juan Germán Roscio', direccion: 'Avenida Cedeño, Centro, Urb. Doña Eva, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Acopio Tamaca', direccion: 'Calle 1, Los Robles, Las Tunitas, Tamaca, Barquisimeto', estado_vzla: 'Lara', horario: '', org: '' },
  { nombre: 'Via Venetto', direccion: 'Calle La Estrella, Centro, San Juan de los Morros', estado_vzla: 'Guárico', horario: '8am-6pm', org: '' },
  { nombre: 'Gobernación de Guárico', direccion: 'Avenida Sendrea, Centro, Urb. Doña Eva, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Shopping Off San Juan', direccion: 'Calle Infante, Centro, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Una Mano Amiga Doña Elvira', direccion: 'Avenida Bolívar, Urbanización Doña Elvira, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: 'Una Mano Amiga' },
  { nombre: 'Biblioteca Rómulo Gallegos SJM', direccion: 'Biblioteca Rómulo Gallegos, Avenida Bolívar, Urbanización Doña Elvira, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Una Mano Amiga Plaza Samanes', direccion: 'Plaza de los Samanes, Av. Bolívar, Centro, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: 'Una Mano Amiga' },
  { nombre: 'Acopio Parroquia El Valle', direccion: 'Urbanización Pedro Freites, Fuerte Tiuna, Caracas', estado_vzla: 'Distrito Capital', horario: '8am-5pm', org: '' },
  { nombre: 'Bomberos de Guacara', direccion: 'Policía Municipal de Guacara, Carretera Nacional Valencia-Guacara, Negro Primero, Guacara', estado_vzla: 'Carabobo', horario: 'Siempre abierto', org: '' },
  { nombre: 'Colegio Caribe', direccion: 'Avenida 31 de Julio, Salamanca, Los Chuares, Puerto La Cruz', estado_vzla: 'Anzoátegui', horario: 'Lun-Dom 9:00-17:00', org: '' },
  { nombre: 'Academia Washington', direccion: 'Calle C, Residencias Valle Arriba Golf, Los Campitos, Caracas', estado_vzla: 'Miranda', horario: 'Vie 26-Dom 28 9:00-16:00', org: '' },
  { nombre: 'Capilla UCAB', direccion: 'Universidad Católica Andrés Bello, Avenida Teherán, Barrio Juana La Avanzadora, Caracas', estado_vzla: 'Miranda', horario: 'A partir de las 8am', org: 'UCAB' },
  { nombre: 'Logística Vincars', direccion: 'Calle Tamare, Macaracuay, Caracas', estado_vzla: 'Miranda', horario: 'Viernes 08:00-14:00', org: 'Vincars' },
  { nombre: 'Plaza de la Bandera Pampatar', direccion: '1.ª Etapa de Jorge Coll, Urbanización Playa El Ángel, Pampatar', estado_vzla: 'Nueva Esparta', horario: '', org: '' },
  { nombre: 'Bomberos La Trinidad', direccion: 'Bomberos de La Trinidad No. 17, Avenida Campo Alegre, Zona Industrial La Trinidad, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Gran Slam Covencaucho', direccion: 'Covencaucho, Carretera Guarenas-Guatire, Urbanización Las Mesetas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Centro Médico La Candelaria Cúa', direccion: 'Cúa, Parroquia Cúa, Municipio Urdaneta', estado_vzla: 'Miranda', horario: 'Vie 8:00-17:00', org: '' },
  { nombre: 'Iglesia Maranatha Valencia', direccion: 'Urb. Industrial Castillito, Calle Este Oeste 98, Valencia', estado_vzla: 'Carabobo', horario: '24h', org: '' },
  { nombre: 'Reda Estate', direccion: '4 Avenidas, Valencia', estado_vzla: 'Carabobo', horario: '', org: '' },
  { nombre: 'Frente CC Cima Barinas', direccion: 'Frente al C.C. Cima, Avenida Andrés Bello, Alto Barinas Sur, Barinas', estado_vzla: 'Barinas', horario: '', org: '' },
  { nombre: 'Alcaldía Roscio Nieves', direccion: 'Calle Cedeño, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Rectorado UNERG', direccion: 'Rectorado UNERG, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: 'UNERG' },
  { nombre: 'Cafetín Clínica Santa Rosalía', direccion: 'Piso 1, Clínica Santa Rosalía, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Alcaldía de San Francisco', direccion: 'Calle 171, La Coromoto, San Francisco, Zulia', estado_vzla: 'Zulia', horario: '', org: '' },
  { nombre: 'U.E. Kavac Prebo', direccion: 'Urb. Prebo 2, Av. 112, Calle 141-B, Valencia', estado_vzla: 'Carabobo', horario: 'Jueves y Viernes', org: '' },
  { nombre: 'Plaza Los Samanes SJM', direccion: 'Plaza Los Samanes, San Juan de los Morros', estado_vzla: 'Guárico', horario: '2pm', org: '' },
  { nombre: 'Kawaii Multitienda Marconi', direccion: 'CC Marconi, Av. Bolívar Sur, Valencia', estado_vzla: 'Carabobo', horario: '', org: '' },
  { nombre: 'Cavernícolas Box', direccion: 'Av. Rómulo Gallegos, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Los Andes 2 San Diego', direccion: 'Los Andes 2, San Diego, Valencia', estado_vzla: 'Carabobo', horario: '', org: '' },
  { nombre: 'Casona Universitaria', direccion: 'Avenida Bolívar, Urbanización Doña Elvira, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Callejón Gourmet', direccion: 'Urbanización La Tropical 1, Centro, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: '' },
  { nombre: 'Centro de Acopio Despistaje Cáncer', direccion: 'Despistaje Cáncer, Calle Los Puentes, Urbanización Doña Elvira, San Juan de los Morros', estado_vzla: 'Guárico', horario: '7am-3pm', org: '' },
  { nombre: 'Ciudad Banesco', direccion: 'Ciudad Banesco, Avenida Principal de Bello Monte, Bello Monte, Caracas', estado_vzla: 'Miranda', horario: 'Vie 9am-4pm', org: '' },
  { nombre: 'Cadoven Sambil', direccion: 'Sambil Mall, Calle José de Jesús Ravelo, Proyecto V Centenario, Caracas', estado_vzla: 'Miranda', horario: '', org: 'Cadoven' },
  { nombre: 'Fundación Juntos Se Puede', direccion: 'Calle 104 #54-31, Barranquilla', estado_vzla: 'Carabobo', horario: '', org: 'Fundación Juntos Se Puede' },
  { nombre: 'CC Borjas Xtrema', direccion: 'Centro Comercial Borjas, Carretera H, Cabimas', estado_vzla: 'Zulia', horario: '', org: '' },
  { nombre: 'Iglesia La Chiquinquirá', direccion: 'Iglesia Nuestra Señora de La Chiquinquirá, Avenida Andrés Bello, San Rafael de La Florida, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: '' },
  { nombre: 'Pepitería 13', direccion: 'Pepitería 13, Calle Madrid, Las Mercedes, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Instituto Diseño Caracas', direccion: 'Instituto Diseño Caracas, Calle Ávila, La Castellana, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: '' },
  { nombre: 'Academia Merici', direccion: 'Academia Merici, Calle Central, Cerro Verde, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'UNERG Paraíso', direccion: 'Universidad Rómulo Gallegos, Calle Cecilio Acosta, Urbanización Cristo Rey, San Juan de los Morros', estado_vzla: 'Guárico', horario: '', org: 'UNERG' },
  { nombre: 'ULA Paramillo', direccion: 'Universidad de Los Andes, Avenida ULA, Paramillo, San Cristóbal', estado_vzla: 'Táchira', horario: '8am-4pm', org: 'ULA' },
  { nombre: 'Acopio Abasto Caracas', direccion: 'Av. Principal Negro Primero, Negro Primero, Parroquia Corazón de Jesús, Caracas', estado_vzla: 'Distrito Capital', horario: '9am-9pm', org: '' },
  { nombre: 'Acopio Candelaria Galerías Ávila', direccion: 'Par de arepas diagonal al estacionamiento del CC Galerías Ávila, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: '' },
  { nombre: 'Capilla Divina Pastora Caracas', direccion: 'Capilla de la Divina Pastora, Calle Amparo, Encarnación-Regina, Caracas', estado_vzla: 'Distrito Capital', horario: '19:00-21:00', org: '' },
  { nombre: 'Acopio Las Mercedes Barriot', direccion: 'Barriot, Calle Madrid, Las Mercedes, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'TSJ San Juan de Colón', direccion: 'Calle 3, Casco Central, San Juan de Colón', estado_vzla: 'Táchira', horario: '9am-7pm', org: 'TSJ' },
  { nombre: 'Concha Acústica Bello Monte', direccion: 'Avenida Tocuyo, Colinas de Bello Monte, Bello Monte, Caracas', estado_vzla: 'Miranda', horario: '9am-7pm', org: '' },
  { nombre: 'CC Talislandia Prebo', direccion: 'Centro Comercial Talislandia, Avenida Monseñor Adams, La Ceiba, Prebo, Valencia', estado_vzla: 'Carabobo', horario: '', org: '' },
  { nombre: 'U.E. Nueva Córdoba', direccion: 'U.E. Nueva Córdoba, Calle Los Pinos, Pueblo Nuevo, Guarenas', estado_vzla: 'Miranda', horario: '8:00-15:00', org: '' },
  { nombre: 'Club Campestre Los Cortijos', direccion: 'Club Campestre Los Cortijos, Avenida Roma, La California Norte, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Polideportivo Los Naranjos', direccion: 'Polideportivo Los Naranjos, Av. Este 3, Los Naranjos, Caracas', estado_vzla: 'Miranda', horario: '', org: 'Asociación de Jóvenes Empresarios' },
  { nombre: 'Centro Principal Guasdualito', direccion: 'Morrones, Guasdualito, Parroquia Guasdualito', estado_vzla: 'Apure', horario: '', org: '' },
  { nombre: 'Redoma Gran Mariscal', direccion: 'Avenida Gran Mariscal, Corinsa, Cagua', estado_vzla: 'Aragua', horario: '', org: '' },
  { nombre: 'Plaza Grande Tronconal 5to', direccion: 'Calle 11, Sector 2 de Tronconal, Urbanización Tronconal, Valencia', estado_vzla: 'Carabobo', horario: '2-8pm', org: '' },
  { nombre: 'Centro de Acopio UCV', direccion: 'Universidad Central de Venezuela, Plaza Rectorado, Ciudad Universitaria, Caracas', estado_vzla: 'Distrito Capital', horario: '', org: 'UCV' },
  { nombre: 'Quinta Garrochal', direccion: 'Calle los Mangos con Av. San Miguel, diagonal Iglesia Nuestra Señora del Pompei, Urb. Alta Florida, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Farmatodo La Matica', direccion: 'Farmatodo, Carretera Panamericana, La Matica, Maracay', estado_vzla: 'Aragua', horario: 'Hasta 4pm', org: 'Farmatodo' },
  { nombre: 'UNET Enfermería', direccion: 'Enfermería UNET, Avenida Perimetral UNET, Barrio El Lobo, San Cristóbal', estado_vzla: 'Táchira', horario: '', org: 'UNET' },
  { nombre: 'Rectorado UNEFM', direccion: 'UNEFM Rectorado, Calle Norte, Casco Histórico, Coro', estado_vzla: 'Falcón', horario: 'Vie 26 y Sáb 27 9:00-17:00', org: 'UNEFM' },
  { nombre: 'Acopio Cartanal', direccion: 'Los Güires, Cartanal, Parroquia Cartanal, Miranda', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Edificio Murachi', direccion: 'Avenida Bolívar, Urbanización Las Acacias, Bella Vista, Maracay', estado_vzla: 'Aragua', horario: '', org: '' },
  { nombre: 'Complejo Vicente Durán Punto Fijo', direccion: 'Complejo Académico Ing. Vicente Durán, Punto Fijo', estado_vzla: 'Falcón', horario: 'Jue 25/06 17:00, Vie 26/06 9:00-17:00', org: '' },
  { nombre: 'Econoquesos', direccion: '5ta Transversal, Urbanización Los Mangles, Parcelamiento Miranda, Valencia', estado_vzla: 'Carabobo', horario: '', org: '' },
  { nombre: 'Parroquia Nuestra Señora de Guadalupe', direccion: 'Carrera 4 entre calles 2 y 3, Andrés Eloy Blanco, Mérida', estado_vzla: 'Mérida', horario: '', org: '' },
  { nombre: 'Acopio Lazos de Esperanza', direccion: 'Calle 29 de Julio, Guarenas', estado_vzla: 'Miranda', horario: '', org: 'Lazos de Esperanza' },
  { nombre: 'Hogar Honim', direccion: 'Carrera 1 con Calle 4, El Supire, Carrera 27-A, Barquisimeto', estado_vzla: 'Lara', horario: '', org: 'Honim' },
  { nombre: 'Universidad de Oriente', direccion: 'Parada UDO, Vía Alterna, Parcelamiento Universidad, Cumaná', estado_vzla: 'Sucre', horario: 'Sáb-Dom 8:00-11:00', org: 'UDO' },
  { nombre: 'Acopio San Juan de Colón (Fucsia)', direccion: 'Casco Central, San Juan de Colón, Parroquia Colón', estado_vzla: 'Táchira', horario: '6pm', org: '' },
  { nombre: 'Acopio Cestas Plásticas CR', direccion: 'Carretera Panamericana, Lomas de Urquía, Carrizal', estado_vzla: 'Miranda', horario: 'Hoy por la tarde', org: '' },
  { nombre: 'Complejo Cultural San Antonio', direccion: 'Complejo Deportivo Recreativo y Cultural Los Salias, San Antonio de los Altos', estado_vzla: 'Miranda', horario: 'Todo el día', org: '' },
  { nombre: 'Las Cachapas de Félix', direccion: 'Claro, Avenida Naciones Unidas, Voz de los Andes, Mérida', estado_vzla: 'Mérida', horario: 'Desde 11am', org: '' },
  { nombre: 'SUMIPAN Market', direccion: 'San Jacinto, Maracay', estado_vzla: 'Aragua', horario: '', org: '' },
  { nombre: 'Plaza Bolívar El Tocuyo', direccion: 'Avenida Lisandro Alvarado, El Tocuyo', estado_vzla: 'Lara', horario: '', org: '' },
  { nombre: 'CSA Ángel Pérez La Pastora', direccion: 'La Pastora, Parroquia Cecilio Zubillaga, Municipio Torres, Lara', estado_vzla: 'Lara', horario: 'Lun-Dom 7:00-22:00', org: 'Comando Con Venezuela' },
  { nombre: 'Acopio Voluntad Popular La Toñona', direccion: 'Escuela Ramón Pompilio Oropeza, Av. Francisco de Miranda, La Toñona, Anzoátegui', estado_vzla: 'Anzoátegui', horario: '', org: 'Voluntad Popular' },
  { nombre: 'Acopio Recíbelo Ya', direccion: 'Calle Bolívar, El Toronjil, San Antonio de los Altos', estado_vzla: 'Miranda', horario: 'Todo el día', org: 'Recíbelo Ya' },
  { nombre: 'Tibisay Hotel Boutique', direccion: 'Tucacas, Parroquia Tucacas, Municipio Silva', estado_vzla: 'Falcón', horario: '', org: '' },
  { nombre: 'Alcaldía Libertador Mérida', direccion: 'Mérida, Parroquia El Llano, Municipio Libertador', estado_vzla: 'Mérida', horario: '', org: '' },
  { nombre: 'Iglesia Sion', direccion: 'Carrera 13C entre calles 45 y 46, Barquisimeto', estado_vzla: 'Lara', horario: 'Jueves a Domingo', org: '' },
  { nombre: 'THE PLACE Chuao', direccion: 'Calle Santa Cruz, Chuao, Lomas de Chuao, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Colegio Mater Salvatoris', direccion: 'Colegio Mater Salvatoris, Av. Principal de Las Mercedes, Las Mercedes, Caracas', estado_vzla: 'Miranda', horario: '', org: '' },
  { nombre: 'Hospitour Barquisimeto', direccion: 'Carrera 25, Macuto, Barquisimeto', estado_vzla: 'Lara', horario: '', org: '' },
  { nombre: 'Amelie Cafe Maracaibo', direccion: 'Avenida 3Y, Parroquia Olegario Villalobos, Maracaibo', estado_vzla: 'Zulia', horario: '', org: '' },
  { nombre: 'Hotel Jirahara', direccion: 'Calle 6, Urbanización Nueva Segovia, Barquisimeto', estado_vzla: 'Lara', horario: '', org: '' },
  { nombre: 'Sede Fly251 Barquisimeto', direccion: 'Aeropuerto Jacinto Lara, Av. La Salle, Barquisimeto', estado_vzla: 'Lara', horario: '', org: 'Fly251' },
];

// Fix Fundación Juntos Se Puede - Calle 104 is likely Valencia Venezuela not Barranquilla
RAW.find(x => x.nombre === 'Fundación Juntos Se Puede').direccion = 'Fundación Juntos Se Puede, Calle 104 #54-31, Valencia';
RAW.find(x => x.nombre === 'Fundación Juntos Se Puede').estado_vzla = 'Carabobo';

// Remove Bolivia entry
const filtered = RAW.filter(r => {
  if (r.estado_vzla === 'Bolivia') return false;
  if (EXISTING_NAMES.has(r.nombre)) return false;
  const hay = `${r.nombre} ${r.direccion}`;
  if (FOREIGN.some(rx => rx.test(hay))) return false;
  return true;
});

// Dedupe by normalized nombre
const seen = new Set();
const unique = filtered.filter(r => {
  const k = r.nombre.toLowerCase().replace(/\s+/g, ' ');
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const FALLBACK = {
  'Distrito Capital': [10.4806, -66.9036],
  'Miranda': [10.4361, -66.8228],
  'Carabobo': [10.1621, -67.9900],
  'Aragua': [10.2469, -67.5958],
  'Guárico': [9.9111, -67.3533],
  'Lara': [10.0647, -69.3570],
  'Barinas': [8.6226, -70.2075],
  'Zulia': [10.6666, -71.6124],
  'Táchira': [7.7698, -72.2250],
  'Anzoátegui': [10.2333, -64.6333],
  'Nueva Esparta': [10.9878, -63.8522],
  'Falcón': [11.6934, -70.2010],
  'Mérida': [8.5897, -71.1561],
  'Apure': [7.2441, -70.7594],
  'Sucre': [10.4530, -64.1826],
  'Monagas': [9.7457, -63.1832],
  'Bolívar': [8.1220, -63.5490],
};

function inVenezuela(lat, lng) {
  return lat >= 0.5 && lat <= 13.5 && lng >= -74 && lng <= -59;
}

/** Pequeño offset para no apilar marcadores en la misma ciudad. */
function jitter(lat, lng, i) {
  const a = ((i * 17) % 31) - 15;
  const b = ((i * 23) % 29) - 14;
  return [+(lat + a * 0.0008).toFixed(7), +(lng + b * 0.0008).toFixed(7)];
}

function esc(s) {
  return (s || '').replace(/'/g, "''");
}

console.error(`Geocodificando ${unique.length} centros...`);
const rows = [];
let i = 0;
for (const r of unique) {
  const q = `${r.direccion}, ${r.estado_vzla}, Venezuela`;
  let geo = await geocode(q);
  if (geo && !inVenezuela(geo.lat, geo.lng)) geo = null;
  if (!geo) geo = await geocode(`${r.estado_vzla}, Venezuela`);
  if (geo && !inVenezuela(geo.lat, geo.lng)) geo = null;
  const base = geo ? [geo.lat, geo.lng] : (FALLBACK[r.estado_vzla] || [8.0, -66.0]);
  const [lat, lng] = jitter(base[0], base[1], i++);
  rows.push({ ...r, lat, lng });
  console.error(`  ${r.nombre}: ${lat}, ${lng}${geo ? '' : ' (aprox)'}`);
}

function sqlValues(list) {
  return list.map(r =>
    `('${esc(r.nombre)}', '${esc(r.org)}', '${esc(r.estado_vzla)}', '${esc(r.direccion)}', ${r.lat}, ${r.lng})`
  ).join(',\n    ');
}

const horarios = unique.map(r => ({ nombre: r.nombre, horario: r.horario || 'Por confirmar' }));

console.log(`-- Centros de acopio adicionales — redes sociales 26-jun-2026
-- ${rows.length} puntos en Venezuela (excluye extranjero, transporte, médicos, duplicados v1)

with seed(nombre, organizacion, estado_vzla, direccion, lat, lng) as (
  values
    ${sqlValues(rows)}
)
insert into centros_acopio (nombre, organizacion, estado_vzla, direccion, lat, lng, horario, notas)
select s.nombre, s.organizacion, s.estado_vzla, s.direccion, s.lat, s.lng,
       coalesce(h.horario, 'Por confirmar'), '__seed_centros_v2__'
from seed s
left join (values
    ${horarios.map(h => `('${esc(h.nombre)}', '${esc(h.horario)}')`).join(',\n    ')}
) as h(nombre, horario) on h.nombre = s.nombre
where not exists (
  select 1 from centros_acopio c where c.nombre = s.nombre
);
`);
