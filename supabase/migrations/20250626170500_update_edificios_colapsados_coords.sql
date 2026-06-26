-- ============================================================
-- AYUDA VENEZUELA — Actualización de coordenadas (verificadas)
-- Fuente: Google Places + confirmaciones manuales, 26-jun-2026.
-- Leyenda de confianza en `notas`:
--   ✅ = coordenada verificada (edificio identificado por nombre en Google)
--   🟡 = aproximada / posible coincidencia (revisar)
--   🔴 = COLAPSO CONFIRMADO en reseñas o confirmación manual
-- Empareja por `nombre`; idempotente en inserts (where not exists).
-- ============================================================

-- ── VERIFICADAS (Caraballeda) ──
update edificios_colapsados set lat=10.6186, lng=-66.8474, sector='Caraballeda', notas='✅ Coord. verificada (torres Mariola + Maribel, adyacentes)' where nombre='Residencias Mariola y Maribel';
update edificios_colapsados set lat=10.6109, lng=-66.8556, sector='Caraballeda', notas='✅ Coord. verificada' where nombre='Residencias Breogan';
update edificios_colapsados set lat=10.6170, lng=-66.8571, sector='Los Corales (Caraballeda)', notas='✅ Coord. verificada (puede existir 2º Costa Brava en Av. Guaicaipuro 10.6112,-66.8422)' where nombre='Edificio Costa Brava';
update edificios_colapsados set lat=10.6164, lng=-66.8589, sector='Caraballeda', notas='✅ Coord. verificada (Res. Ilona)' where nombre='Residencias Llona';
update edificios_colapsados set lat=10.6167, lng=-66.8446, sector='Caraballeda', notas='✅ Coord. verificada (Roca Park, Av. José María España)' where nombre='Rocapark';
update edificios_colapsados set lat=10.6180, lng=-66.8548, sector='Caraballeda', notas='✅ Coord. verificada (Av. La Costanera)' where nombre='Residencias Coral Beach';
update edificios_colapsados set lat=10.6124, lng=-66.8413, sector='Caraballeda', notas='✅ Coord. verificada' where nombre='Edificio Albatros';
update edificios_colapsados set lat=10.6124, lng=-66.8413, sector='Caraballeda', notas='✅ DUPLICADO de Edificio Albatros — fusionar' where nombre='Albatros';
update edificios_colapsados set lat=10.6182, lng=-66.8552, sector='Caraballeda', notas='✅ Coord. verificada' where nombre='Rita Sol Palace';
update edificios_colapsados set lat=10.6182, lng=-66.8552, sector='Caraballeda', notas='✅ DUPLICADO de Rita Sol Palace — fusionar' where nombre='Residencias Ritasol Palace';
update edificios_colapsados set lat=10.6175, lng=-66.8568, sector='Caraballeda', notas='✅ Coord. verificada (Res. La Gabarra; NO el Hotel La Gabarra)' where nombre='Edificio La Gabarra';
update edificios_colapsados set lat=10.6186, lng=-66.8488, sector='Caraballeda', notas='✅ Coord. verificada (Res. Vistamar, frente Playa El Yate)' where nombre='Residencias Vistalmar';
update edificios_colapsados set lat=10.6160, lng=-66.8388, sector='Caraballeda', notas='✅ Coord. verificada (Edf. Marianamar)' where nombre='Mariana Mar';
update edificios_colapsados set lat=10.6184, lng=-66.8495, sector='Caraballeda', notas='✅ Coord. verificada (Boulevard Monteclaro)' where nombre='Tahití (Caraballeda)';
update edificios_colapsados set lat=10.6178, lng=-66.8525, sector='Caraballeda', notas='✅ Coord. verificada (Res. Coral Bella, Av. La Costanera)' where nombre='Coral Bella';
update edificios_colapsados set lat=10.6089, lng=-66.8585, sector='Los Corales (Caraballeda)', notas='✅ Coord. verificada (Torre D del conjunto Parque Mar; OJO: Google la ubica en Los Corales, no en Playa Grande)' where nombre='La Llovizna (Playa Grande)';

-- ── VERIFICADAS (Macuto) ──
update edificios_colapsados set lat=10.6113, lng=-66.8854, sector='Macuto (Punta Brisa)', notas='✅ Coord. verificada' where nombre='Edificio Punta Brisas';
update edificios_colapsados set lat=10.6112, lng=-66.8842, sector='Macuto (Punta Brisa)', notas='✅ Coord. verificada' where nombre='Res Puerto Coral (Macuto)';
update edificios_colapsados set lat=10.6088, lng=-66.8899, sector='Macuto', notas='✅ Coord. verificada (Av. José María España)' where nombre='Res Club de Playa (Macuto)';

-- ── VERIFICADAS (Playa Grande / Maiquetía, zona oeste ~ -67.0) ──
update edificios_colapsados set lat=10.6102, lng=-67.0114, sector='Playa Grande / Maiquetía', personas_atrapadas=true, notas='🔴 COLAPSO CONFIRMADO en reseñas (personas atrapadas ~48h). Coord. verificada' where nombre='Edificio Oasis Beach';
update edificios_colapsados set lat=10.6097, lng=-67.0271, sector='Playa Grande / Maiquetía', personas_atrapadas=true, notas='🔴 COLAPSO CONFIRMADO en reseñas (dos torres). Coord. verificada' where nombre='Bello Horizonte (Playa Grande)';
update edificios_colapsados set lat=10.6101, lng=-67.0253, sector='Playa Grande / Maiquetía', notas='✅ Coord. verificada (Av. Principal de Playa Grande)' where nombre='Los Delfines';

-- ── POSIBLES / APROXIMADAS (🟡 revisar antes de confiar) ──
update edificios_colapsados set lat=10.6186, lng=-66.8592, sector='Los Corales (Caraballeda)', notas='🟡 Aprox. al centro de Playa Los Corales; edificio no identificado por nombre' where nombre='Residencias Los Corales';
update edificios_colapsados set lat=10.6084, lng=-66.8575, sector='Caraballeda', notas='🟡 Posible coincidencia con conjunto Parque Mar — verificar' where nombre='Edificio Parque Caraballeda';
update edificios_colapsados set lat=10.6117, lng=-67.0175, sector='Maiquetía', notas='🟡 Posible (Res. Pez Vela, zona marina Maiquetía) — verificar' where nombre='Pez Vela';
update edificios_colapsados set lat=10.6188, lng=-66.8499, sector='Caraballeda', notas='🟡 Existe "Residencias Caribe" en Caraballeda (10.6188,-66.8499); confirmar si es ésta o la de Los Cocos' where nombre='Residencias Caribe (Los Cocos)';

-- ── NUEVO: colapso confirmado NO listado originalmente ──
insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
select 'Residencias Palma Real','La Guaira','Caraballeda',10.6158125,-66.8378125,'colapsado',true,'Confirmación manual 26-jun-2026','🔴 COLAPSO CONFIRMADO. Plus Code recibido: J586+8V Caraballeda, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where not exists (select 1 from edificios_colapsados where nombre='Residencias Palma Real');

-- ── NUEVAS CONFIRMACIONES MANUALES (direcciones / Plus Codes provistos por usuario) ──
update edificios_colapsados
set sector='Macuto',
    estado_edificio='colapsado',
    fuente='Confirmación manual 26-jun-2026',
    notas='🔴 COLAPSO CONFIRMADO. Dirección confirmada: Hotel Eduard''s, Avenida La Playa, Macuto 1163, La Guaira, Venezuela. Pendiente capturar/verificar lat/lng exacta en sitio.'
where nombre='Hotel Eduard''s';

update edificios_colapsados
set lat=10.6125625,
    lng=-66.8441875,
    sector='Caraballeda',
    estado_edificio='colapsado',
    fuente='Confirmación manual 26-jun-2026',
    notas='🔴 COLAPSO CONFIRMADO. Dirección/Plus Code: J574+288 Residencias El Molino, Caraballeda 1165, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where nombre='Residencias El Molino';

insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
select 'Residencias El Molino','La Guaira','Caraballeda',10.6125625,-66.8441875,'colapsado',false,'Confirmación manual 26-jun-2026','🔴 COLAPSO CONFIRMADO. Dirección/Plus Code: J574+288 Residencias El Molino, Caraballeda 1165, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where not exists (select 1 from edificios_colapsados where nombre='Residencias El Molino');

insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
select 'Calle Real de Playa Verde (edificio por confirmar)','La Guaira','Playa Verde / Maiquetía',10.6116875,-67.0115625,'colapsado',false,'Confirmación manual 26-jun-2026','🔴 COLAPSO CONFIRMADO. Dirección/Plus Code: JX6Q+M9W, Calle Real de Playa Verde, Maiquetía 1162, La Guaira, Venezuela. Nombre del edificio pendiente; coord. derivada de Plus Code corto; verificar en sitio.'
where not exists (select 1 from edificios_colapsados where nombre='Calle Real de Playa Verde (edificio por confirmar)');

update edificios_colapsados
set lat=10.6158125,
    lng=-66.8378125,
    sector='Caraballeda',
    estado_edificio='colapsado',
    fuente='Confirmación manual 26-jun-2026',
    notas='🔴 COLAPSO CONFIRMADO. Plus Code recibido: J586+8V Caraballeda, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where nombre='Residencias Palma Real';

insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
select 'J586+8V Caraballeda (edificio por confirmar)','La Guaira','Caraballeda',10.6158125,-66.8378125,'colapsado',false,'Confirmación manual 26-jun-2026','🔴 COLAPSO CONFIRMADO. Plus Code recibido: J586+8V Caraballeda, La Guaira, Venezuela. Nombre del edificio pendiente; coord. derivada de Plus Code corto; verificar en sitio.'
where not exists (select 1 from edificios_colapsados where nombre='Residencias Palma Real')
  and not exists (select 1 from edificios_colapsados where nombre='J586+8V Caraballeda (edificio por confirmar)');

-- ── NO ENCONTRADAS por nombre (siguen con coord. aprox. por sector) ──
update edificios_colapsados set notas=coalesce(notas,'')||' · 🟡 Sin verificar: ubicación por sector. Capturar GPS en sitio.'
  where nombre in ('Residencias Gran Terraza','Residencias La Trinidad','Edificio Dist Rosanday','Miramar',
    'Residencias La Mar Suite','Marina Grande','SUMA','Misión Vivienda Los Cocos',
    'Bloque 3 La Páez','Urb. Hugo Chávez','Las Palmas','Vista Brava','Bucanero','La Estrella',
    'Canes (Catia La Mar)','Mariola (Macuto)');

-- ── NUEVAS CONFIRMACIONES MANUALES (26-jun-2026) — Plus Code J566+HHQ, Caraballeda ──
update edificios_colapsados
set lat=10.6114375,
    lng=-66.8385625,
    sector='Caraballeda',
    estado_edificio='colapsado',
    fuente='Confirmación manual 26-jun-2026',
    notas='🔴 COLAPSO CONFIRMADO. Edificio Carina desplomado. Dirección/Plus Code: J566+HHQ, Caraballeda 1165, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where nombre='Edificio Carina';

insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
select 'Edificio Carina','La Guaira','Caraballeda',10.6114375,-66.8385625,'colapsado',false,'Confirmación manual 26-jun-2026','🔴 COLAPSO CONFIRMADO. Edificio Carina desplomado. Dirección/Plus Code: J566+HHQ, Caraballeda 1165, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where not exists (select 1 from edificios_colapsados where nombre='Edificio Carina');

-- Edificio Gaby: colapso parcial → danos_graves (valor permitido por check constraint)
update edificios_colapsados
set lat=10.6114375,
    lng=-66.8385625,
    sector='Caraballeda',
    estado_edificio='danos_graves',
    fuente='Confirmación manual 26-jun-2026',
    notas='🟠 COLAPSO PARCIAL CONFIRMADO. Edificio Gaby. Dirección/Plus Code: J566+HHQ, Caraballeda 1165, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where nombre='Edificio Gaby';

insert into edificios_colapsados (nombre, zona, sector, lat, lng, estado_edificio, personas_atrapadas, fuente, notas)
select 'Edificio Gaby','La Guaira','Caraballeda',10.6114375,-66.8385625,'danos_graves',false,'Confirmación manual 26-jun-2026','🟠 COLAPSO PARCIAL CONFIRMADO. Edificio Gaby. Dirección/Plus Code: J566+HHQ, Caraballeda 1165, La Guaira, Venezuela. Coord. derivada de Plus Code corto; verificar en sitio.'
where not exists (select 1 from edificios_colapsados where nombre='Edificio Gaby');
