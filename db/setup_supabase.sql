-- ============================================================
-- AYUDA VENEZUELA — Setup Supabase v2
-- Terremoto doblete Yaracuy 24-jun-2026 (7,2 + 7,5 Mw)
-- Cifras oficiales 26-jun (Delcy Rodríguez): ~235 fallecidos, +4.300 heridos.
-- La Guaira declarada zona de desastre.
--
-- Novedades v2 vs v1 (clave para esta app):
--   1) PROXIMIDAD: función necesidades_cercanas() -> ranking por distancia real.
--   2) ANTIDUPLICADOS: source_hash único, confirmaciones, merged_into, edificio_id.
--   3) PROCEDENCIA: campo fuente (ciudadano / instagram / tiktok / coordinador).
--
-- Para proyectos nuevos, preferir: supabase db push (ver supabase/migrations/).
-- Este archivo es para ejecución manual en Supabase > SQL Editor (incluye DROP).
-- ============================================================

drop table if exists edificios_colapsados cascade;
drop table if exists centros_acopio cascade;
drop table if exists recursos cascade;
drop table if exists necesidades cascade;

-- ── EDIFICIOS COLAPSADOS (se crea primero por la FK desde necesidades) ──
create table edificios_colapsados (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  zona text not null,
  sector text,
  lat double precision not null,
  lng double precision not null,
  estado_edificio text not null default 'colapsado'
    check (estado_edificio in ('colapsado','danos_graves','en_riesgo','evaluando')),
  personas_atrapadas boolean default false,
  rescate_activo boolean default false,
  notas text,
  fuente text,
  created_at timestamptz default now()
);

-- ── NECESIDADES ──────────────────────────────────────────────
create table necesidades (
  id uuid default gen_random_uuid() primary key,
  zona text not null,
  direccion_exacta text not null,
  lat double precision,
  lng double precision,
  tipo text not null,
  tipos text[],
  subtipo text,
  subtipos text[] default '{}',
  otro text,
  urgencia text not null default 'urgente' check (urgencia in ('critica','urgente','normal')),
  descripcion text not null,
  cantidad text,
  personas_afectadas int,
  nombre_contacto text not null,
  telefono text,
  whatsapp text,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_proceso','cubierta')),
  validada boolean default false,
  notas_coordinador text,
  -- Antiduplicados / procedencia
  edificio_id uuid references edificios_colapsados(id),
  fuente text not null default 'ciudadano' check (fuente in ('ciudadano','instagram','tiktok','twitter','telegram','coordinador')),
  source_url text,
  source_hash text,                      -- huella del post original (scraper)
  confirmaciones int not null default 1, -- cuántas personas/reportes confirman lo mismo
  merged_into uuid references necesidades(id), -- si != null, es un duplicado fusionado
  en_atencion_por text,
  en_atencion_at timestamptz,
  created_at timestamptz default now()
);

-- source_hash único SOLO cuando existe (evita reinsertar el mismo post de IG/TikTok)
create unique index necesidades_source_hash_uniq
  on necesidades (source_hash) where source_hash is not null;
create index necesidades_geo_idx on necesidades (lat, lng);
create index necesidades_estado_idx on necesidades (estado);

-- ── RECURSOS ─────────────────────────────────────────────────
create table recursos (
  id uuid default gen_random_uuid() primary key,
  tipo text not null,
  subtipo text,
  cantidad text not null,
  centro_acopio_id uuid,
  zona_origen text,
  direccion_origen text,
  lat double precision,
  lng double precision,
  nombre_contacto text not null,
  telefono text not null,
  whatsapp text,
  notas text,
  estado text not null default 'disponible' check (estado in ('disponible','asignado','entregado')),
  created_at timestamptz default now()
);

-- ── CENTROS DE ACOPIO ────────────────────────────────────────
create table centros_acopio (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  organizacion text,
  estado_vzla text not null,
  direccion text not null,
  lat double precision not null,
  lng double precision not null,
  telefono text,
  horario text,
  necesita_ahora text[] default '{}',
  ya_cubierto text[] default '{}',
  activo boolean default true,
  notas text,
  created_at timestamptz default now()
);

-- ============================================================
-- FUNCIONES RPC (proximidad + antiduplicados)
-- ============================================================

-- Distancia Haversine en metros, sin depender de PostGIS.
create or replace function _dist_m(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)
  ));
$$;

-- Necesidades cercanas a un punto, ordenadas por distancia.
-- Úsala para: (a) ordenar "Quiero ayudar" por cercanía,
--             (b) detectar posibles duplicados al reportar (radio pequeño + tipo).
create or replace function necesidades_cercanas(
  p_lat double precision,
  p_lng double precision,
  p_radio_m double precision default 100000,
  p_tipo text default null
)
returns table (
  id uuid, zona text, direccion_exacta text, lat double precision, lng double precision,
  tipo text, tipos text[], subtipo text, subtipos text[], otro text,
  urgencia text, descripcion text, cantidad text, personas_afectadas int,
  nombre_contacto text, telefono text, whatsapp text, estado text, validada boolean,
  notas_coordinador text, confirmaciones int, fuente text, edificio_id uuid,
  en_atencion_por text, en_atencion_at timestamptz,
  created_at timestamptz, distancia_m double precision
)
language sql stable as $$
  select n.id, n.zona, n.direccion_exacta, n.lat, n.lng, n.tipo, n.tipos, n.subtipo, n.subtipos,
         n.otro, n.urgencia, n.descripcion, n.cantidad, n.personas_afectadas,
         n.nombre_contacto, n.telefono, n.whatsapp, n.estado, n.validada,
         n.notas_coordinador, n.confirmaciones, n.fuente, n.edificio_id,
         n.en_atencion_por, n.en_atencion_at, n.created_at,
         _dist_m(p_lat, p_lng, n.lat, n.lng) as distancia_m
  from necesidades n
  where n.estado <> 'cubierta'
    and n.merged_into is null
    and n.lat is not null and n.lng is not null
    and (
      p_tipo is null
      or n.tipo = p_tipo
      or (n.tipos is not null and p_tipo = any(n.tipos))
    )
    and _dist_m(p_lat, p_lng, n.lat, n.lng) <= p_radio_m
  order by distancia_m asc;
$$;

-- Sumar una confirmación a una necesidad existente (en vez de crear un duplicado).
create or replace function confirmar_necesidad(p_id uuid)
returns void language sql as $$
  update necesidades set confirmaciones = confirmaciones + 1 where id = p_id;
$$;

create or replace function marcar_en_atencion(p_id uuid, p_telefono text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
  v_row necesidades%rowtype;
begin
  if v_tel is null then raise exception 'Falta teléfono del voluntario'; end if;
  select * into v_row from necesidades where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_row.estado = 'cubierta' then raise exception 'Esta solicitud ya está atendida'; end if;
  if v_row.estado = 'en_proceso' and v_row.en_atencion_por is not null and v_row.en_atencion_por <> v_tel then
    raise exception 'Otro voluntario ya va en camino';
  end if;
  update necesidades set estado = 'en_proceso', en_atencion_por = v_tel, en_atencion_at = now() where id = p_id;
end;
$$;

create or replace function marcar_cubierta(p_id uuid, p_telefono text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
  v_row necesidades%rowtype;
begin
  select * into v_row from necesidades where id = p_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_row.estado = 'cubierta' then return; end if;
  if v_tel is not null and v_row.en_atencion_por is not null and v_row.en_atencion_por <> v_tel then
    raise exception 'Solo quien va en camino puede marcarla atendida';
  end if;
  update necesidades set estado = 'cubierta' where id = p_id;
end;
$$;

create or replace function liberar_atencion(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update necesidades set estado = 'pendiente', en_atencion_por = null, en_atencion_at = null
  where id = p_id and estado = 'en_proceso';
end;
$$;

grant execute on function marcar_en_atencion(uuid, text) to anon, authenticated;
grant execute on function marcar_cubierta(uuid, text) to anon, authenticated;
grant execute on function liberar_atencion(uuid) to anon, authenticated;

-- ── RLS (acceso público de emergencia; moderación vía Table Editor) ──
alter table necesidades enable row level security;
alter table recursos enable row level security;
alter table centros_acopio enable row level security;
alter table edificios_colapsados enable row level security;

create policy "pub_read_necesidades"   on necesidades for select using (true);
create policy "pub_insert_necesidades" on necesidades for insert with check (true);
create policy "pub_update_necesidades" on necesidades for update using (true);

create policy "pub_read_recursos"   on recursos for select using (true);
create policy "pub_insert_recursos" on recursos for insert with check (true);
create policy "pub_update_recursos" on recursos for update using (true);

create policy "pub_read_acopio"   on centros_acopio for select using (true);
create policy "pub_insert_acopio" on centros_acopio for insert with check (true);
create policy "pub_update_acopio" on centros_acopio for update using (true);

create policy "pub_read_edificios"   on edificios_colapsados for select using (true);
create policy "pub_insert_edificios" on edificios_colapsados for insert with check (true);
create policy "pub_update_edificios" on edificios_colapsados for update using (true);

-- ============================================================
-- DATOS SEMILLA
-- ============================================================

-- ── CENTROS DE ACOPIO ────────────────────────────────────────
insert into centros_acopio (nombre, organizacion, estado_vzla, direccion, lat, lng, horario) values
('Iglesia La Paz Montalbán','','Distrito Capital','Montalbán 1, Municipio Libertador, Caracas',10.4812,-67.0021,'Por confirmar'),
('Iglesia San Bernardino de Siena','','Distrito Capital','Parroquia San Bernardino, Caracas',10.5052,-66.9183,'Por confirmar'),
('Club Hípico de Caracas (Rotaract)','Rotaract Caracas','Distrito Capital','Terrazas del Club Hípico, La Trinidad, Caracas',10.4302,-66.8851,'Por confirmar'),
('Quinta El Bejucal – 4ta Av Altamira','Comando Con Venezuela','Miranda','4ta Avenida de Altamira entre 9na y 10ma transversal, Chacao',10.4950,-66.8482,'Por confirmar'),
('Torre Tamanaco Local 3 PB','','Miranda','Torre Tamanaco, Las Mercedes, Caracas',10.4802,-66.8582,'Por confirmar'),
('CC La Capilla Piso 1 Local 21','Comando Con Venezuela','Aragua','Av 19 de Abril, Centro Comercial La Capilla, Maracay',10.2390,-67.5950,'Por confirmar'),
('Paseo de la Libertad – frente Centro Médico Maracay','Voluntad Popular','Aragua','Av Las Delicias, frente al Centro Médico de Maracay',10.2441,-67.5965,'Por confirmar'),
('Esquina Banesco Av República','Voluntad Popular','Bolívar','Av República, Municipio Angostura del Orinoco, Ciudad Bolívar',8.1220,-63.5490,'Por confirmar'),
('Edif. Talislandia Mezzanina','Con Venezuela / Op. Todos con Venezuela','Carabobo','Av Monseñor Adams, El Viñedo, Valencia',10.1627,-67.9935,'Por confirmar'),
('Tatas Food Barquisimeto','','Lara','Carrera 15 entre calles 13A y 13B, Barquisimeto',10.0631,-69.3340,'Por confirmar'),
('Quinta Bejucal Altamira','Comando Con Venezuela','Miranda','4ta Av de Altamira entre 9na y 10ma transversal, Chacao',10.4951,-66.8483,'Por confirmar'),
('Calle 6 antigua Bermúdez','Voluntad Popular Monagas','Monagas','Calle 6, antigua Bermúdez, casa N11, Maturín',9.7450,-63.1900,'Por confirmar'),
('Núcleo Táchira ULA','Universidad de Los Andes','Táchira','ULA Núcleo Táchira, San Cristóbal',7.7700,-72.2250,'Por confirmar'),
('Sede Un Nuevo Tiempo Zulia','Un Nuevo Tiempo (UNT)','Zulia','Sede regional UNT, Maracaibo',10.6320,-71.6400,'Por confirmar'),
('Sede Vente Zulia','Vente Venezuela','Zulia','Calle 70 con Av 15A y 15B N15A-39, Maracaibo',10.6501,-71.6142,'Por confirmar');

-- ── EDIFICIOS COLAPSADOS LA GUAIRA (coordenadas aproximadas por sector) ──
insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente) values
('Residencias Mariola y Maribel','La Guaira','Caraballeda',10.6120,-66.8390,'colapsado',true,'Reporte ciudadano'),
('Residencias Gran Terraza','La Guaira','Caraballeda',10.6125,-66.8410,'colapsado',true,'Reporte ciudadano'),
('Residencias Breogan','La Guaira','Caraballeda',10.6118,-66.8422,'colapsado',false,'Reporte ciudadano'),
('Residencias Caribe (Los Cocos)','La Guaira','Los Cocos',10.6190,-66.8080,'colapsado',false,'Reporte ciudadano'),
('Residencias La Trinidad','La Guaira','Caraballeda',10.6130,-66.8380,'colapsado',true,'Reporte ciudadano'),
('Edificio Dist Rosanday','La Guaira','La Guaira centro',10.6015,-66.9310,'colapsado',false,'Reporte ciudadano'),
('Edificio Costa Brava','La Guaira','Caraballeda',10.6140,-66.8350,'colapsado',false,'Reporte ciudadano'),
('Residencias Llona','La Guaira','La Guaira centro',10.6020,-66.9280,'colapsado',false,'Reporte ciudadano'),
('Miramar','La Guaira','La Guaira centro',10.6018,-66.9295,'colapsado',false,'Reporte ciudadano'),
('Rocapark','La Guaira','La Guaira centro',10.6012,-66.9320,'colapsado',false,'Reporte ciudadano'),
('Residencias La Mar Suite','La Guaira','Caraballeda',10.6135,-66.8400,'colapsado',false,'Reporte ciudadano'),
('Edificio Oasis Beach','La Guaira','Caraballeda',10.6128,-66.8365,'colapsado',false,'Reporte ciudadano'),
('Edificio Parque Caraballeda','La Guaira','Caraballeda',10.6122,-66.8395,'colapsado',true,'Reporte ciudadano'),
('Residencias Coral Beach','La Guaira','Macuto',10.6175,-66.8780,'colapsado',false,'Reporte ciudadano'),
('Edificio Albatros','La Guaira','Caraballeda',10.6133,-66.8370,'colapsado',false,'Reporte ciudadano'),
('Hotel Eduard''s','La Guaira','La Guaira centro',10.6008,-66.9340,'colapsado',true,'Reporte ciudadano / prensa'),
('Residencias Los Corales','La Guaira','Caraballeda',10.6117,-66.8430,'colapsado',false,'Reporte ciudadano'),
('Rita Sol Palace','La Guaira','Playa Grande',10.6148,-66.8620,'colapsado',false,'Reporte ciudadano'),
('Edificio Punta Brisas','La Guaira','Caraballeda',10.6110,-66.8445,'colapsado',false,'Reporte ciudadano'),
('Residencias Ritasol Palace','La Guaira','Playa Grande',10.6145,-66.8615,'colapsado',false,'Reporte ciudadano'),
('Edificio La Gabarra','La Guaira','La Guaira centro',10.6022,-66.9275,'colapsado',false,'Reporte ciudadano'),
('Pez Vela','La Guaira','Caraballeda',10.6138,-66.8360,'colapsado',false,'Reporte ciudadano'),
('Residencias Vistalmar','La Guaira','Caraballeda',10.6142,-66.8385,'colapsado',false,'Reporte ciudadano'),
('Marina Grande','La Guaira','La Guaira centro',10.6005,-66.9350,'colapsado',false,'Reporte ciudadano'),
('Mariana Mar','La Guaira','Caraballeda',10.6115,-66.8408,'colapsado',false,'Reporte ciudadano'),
('SUMA','La Guaira','Catia La Mar',10.5998,-66.9380,'colapsado',false,'Reporte ciudadano'),
('Misión Vivienda Los Cocos','La Guaira','Los Cocos / Naiguatá',10.6195,-66.8050,'colapsado',true,'Reporte ciudadano'),
('Mariola (Macuto)','La Guaira','Macuto',10.6180,-66.8760,'colapsado',false,'Reporte ciudadano'),
('Bloque 3 La Páez','La Guaira','La Guaira centro',10.6025,-66.9265,'colapsado',false,'Reporte ciudadano'),
('Tahití (Caraballeda)','La Guaira','Caraballeda',10.6127,-66.8420,'colapsado',false,'Reporte ciudadano'),
('Los Delfines','La Guaira','Caraballeda',10.6119,-66.8435,'colapsado',false,'Reporte ciudadano'),
('Bello Horizonte (Playa Grande)','La Guaira','Playa Grande',10.6150,-66.8600,'colapsado',false,'Reporte ciudadano'),
('La Llovizna (Playa Grande)','La Guaira','Playa Grande',10.6152,-66.8595,'colapsado',false,'Reporte ciudadano'),
('Costa Brava','La Guaira','Caraballeda',10.6140,-66.8352,'colapsado',false,'Reporte ciudadano'),
('Urb. Hugo Chávez','La Guaira','La Guaira centro',10.6030,-66.9310,'colapsado',false,'Reporte ciudadano'),
('Coral Bella','La Guaira','Caraballeda',10.6123,-66.8412,'colapsado',false,'Reporte ciudadano'),
('Res Club de Playa (Macuto)','La Guaira','Macuto',10.6170,-66.8770,'colapsado',false,'Reporte ciudadano'),
('Las Palmas','La Guaira','Caraballeda',10.6136,-66.8395,'colapsado',false,'Reporte ciudadano'),
('Vista Brava','La Guaira','Caraballeda',10.6144,-66.8342,'colapsado',false,'Reporte ciudadano'),
('Bucanero','La Guaira','Caraballeda',10.6121,-66.8440,'colapsado',false,'Reporte ciudadano'),
('La Estrella','La Guaira','La Guaira centro',10.6010,-66.9330,'colapsado',false,'Reporte ciudadano'),
('Albatros','La Guaira','Caraballeda',10.6131,-66.8375,'colapsado',false,'Reporte ciudadano'),
('Canes (Catia La Mar)','La Guaira','Catia La Mar',10.5995,-66.9390,'colapsado',false,'Reporte ciudadano'),
('Res Puerto Coral (Macuto)','La Guaira','Macuto',10.6182,-66.8750,'colapsado',false,'Reporte ciudadano');

-- ── NECESIDADES INICIALES (cargadas por coordinación) ────────
insert into necesidades (zona, direccion_exacta, lat, lng, tipo, urgencia, descripcion, cantidad, personas_afectadas, nombre_contacto, telefono, validada, fuente) values
('La Guaira','Av. La Armada frente al Hotel Meliá, La Guaira',10.6012,-66.8731,'Rescate','critica','Edificio colapsado con aprox. 15 personas atrapadas. Necesitan maquinaria pesada y equipo SAR urgente.','Maquinaria + 10 rescatistas',15,'Carlos Medina','+58412111223',true,'coordinador'),
('La Guaira','C/ Bolívar sector Maiquetía, a 200m del aeropuerto',10.6022,-66.9904,'Agua potable','critica','300 personas sin agua desde el sismo.','Mínimo 500 botellones',300,'Rosa Páez','+58414555001',true,'coordinador'),
('Caracas','Hospital de Campaña, Parque El Valle, Av. Intercomunal',10.4393,-66.9262,'Medicamentos','urgente','Hospital de campaña desbordado. Faltan suero, vendas, analgésicos y antibióticos.','Ver descripción',null,'Dra. Ana Pérez','+58424999887',true,'coordinador'),
('Yaracuy','Plaza Bolívar de San Felipe, calle 5, San Felipe',10.3389,-68.7441,'Refugio / carpas','urgente','~200 familias durmiendo a la intemperie.','200 carpas / 400 frazadas',800,'Alcaldía San Felipe','+582518000001',true,'coordinador'),
('Aragua','Liceo Agustín Codazzi, Av. Bolívar, Maracay',10.2469,-67.5958,'Alimentos','urgente','80 familias (320 personas) sin comida desde ayer.','Comida para 320 personas',320,'ONG Manos Unidas','+58412777432',true,'coordinador'),
('Carabobo','Hospital Central de Valencia, Av. Monseñor Adams',10.1627,-67.9965,'Sangre / donantes','critica','Quirófanos a plena capacidad. Urgente donantes tipo O+ y A−.','Donantes tipo O+ y A−',null,'Hospital Central VLC','+58241858444',true,'coordinador');

update necesidades set tipos = array[tipo] where tipos is null;

-- ── Posts redes: cola de moderación ──────────────────────────
create table if not exists app_config (
  key text primary key,
  value text not null
);
alter table app_config enable row level security;
insert into app_config (key, value) values ('admin_pin', 'vzla26') on conflict (key) do nothing;

create table if not exists posts_redes (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('instagram','tiktok','twitter','telegram')),
  post_id text not null,
  url text,
  texto text not null default '',
  usuario text,
  ubicacion_post text,
  post_ts timestamptz,
  source_hash text not null,
  categoria text,
  tipo text,
  urgencia text,
  zona text,
  direccion text,
  descripcion text,
  cantidad text,
  telefono text,
  confianza numeric(4,3),
  lat double precision,
  lng double precision,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado','descartado','duplicado')),
  necesidad_id uuid references necesidades(id),
  notas_admin text,
  revisado_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists posts_redes_source_hash_uniq on posts_redes (source_hash);
create index if not exists posts_redes_estado_idx on posts_redes (estado);
alter table posts_redes enable row level security;
create policy "pub_read_posts_redes" on posts_redes for select using (true);
create policy "pub_insert_posts_redes" on posts_redes for insert with check (true);
create policy "pub_update_posts_redes" on posts_redes for update using (true);

-- Ver migración 20250626160000_posts_redes_moderacion.sql para RPCs aprobar/rechazar

-- Realtime para mapa/lista en vivo
alter publication supabase_realtime add table necesidades;
alter publication supabase_realtime add table posts_redes;

-- ── Orientación profesional gratuita ─────────────────────────
create table if not exists asesores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  profesion     text,
  categoria     text not null,
  descripcion   text not null,
  modos         text[] default '{}',
  disponibilidad text,
  idiomas       text default 'Español',
  telefono      text not null,
  whatsapp      text,
  estado        text not null default 'activo' check (estado in ('activo', 'pausado')),
  created_at    timestamptz not null default now()
);

create index if not exists asesores_estado_idx on asesores (estado);
create index if not exists asesores_categoria_idx on asesores (categoria);

alter table asesores enable row level security;

create policy "asesores lectura pública"
  on asesores for select using (estado = 'activo');

create policy "admin_read_asesores"
  on asesores for select using (is_admin());

create policy "asesores alta pública"
  on asesores for insert with check (true);

create policy "admin_update_asesores"
  on asesores for update using (is_admin());

create policy "admin_delete_asesores"
  on asesores for delete using (is_admin());

alter publication supabase_realtime add table asesores;
