#!/usr/bin/env node
/**
 * Importa centros de acopio desde:
 *   - acopiovenezuela.vercel.app (Sheet2API)
 *   - centrosayudavenezuela.org (HTML)
 *
 * Requiere migración 20250628180000_centros_acopio_import_fields.sql
 * y SUPABASE_KEY (service_role) en ForVzla/.env
 *
 * Uso:
 *   DRY_RUN=1 node scripts/import_centros_externos.js     # vista previa
 *   node scripts/import_centros_externos.js               # inserta
 *   ONLY_VE=1 node scripts/import_centros_externos.js     # solo Venezuela
 *   LIMIT=20 DRY_RUN=1 node scripts/import_centros_externos.js
 */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_VE = process.env.ONLY_VE === '1';
const LIMIT = process.env.LIMIT ? +process.env.LIMIT : 0;

const ACOPIO_API = 'https://sheet2api.com/v1/asiBQJjRTh2I/copia-de-centros-de-acopio-terremoto-venezuela';
const CAV_URL = 'https://centrosayudavenezuela.org/';

const VE_ESTADOS = new Set([
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo',
  'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'La Guaira',
  'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre',
  'Táchira', 'Trujillo', 'Vargas', 'Yaracuy', 'Zulia',
]);

const FALLBACK_VE = {
  'Distrito Capital': [10.48, -66.90],
  Miranda: [10.40, -66.85],
  Carabobo: [10.16, -68.00],
  Aragua: [10.24, -67.60],
  Lara: [10.07, -69.32],
  Zulia: [10.63, -71.64],
  Anzoátegui: [10.13, -64.68],
  Bolívar: [8.12, -63.55],
  Táchira: [7.77, -72.23],
  Monagas: [9.75, -63.18],
  Guárico: [9.91, -67.35],
  Barinas: [8.62, -70.21],
  'Nueva Esparta': [10.99, -63.92],
  Falcón: [11.69, -70.20],
  Mérida: [8.59, -71.16],
  Apure: [7.24, -70.76],
  Sucre: [10.45, -64.18],
};

const geoCache = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

function sourceHash(fuente, nombre, direccion) {
  return crypto.createHash('sha256')
    .update(`${fuente}|${norm(nombre)}|${norm(direccion)}`)
    .digest('hex')
    .slice(0, 32);
}

function parseMapsUrl(raw) {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], approx: false };
  m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: +m[1], lng: +m[2], approx: false };
  m = s.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (m) return { lat: +m[1], lng: +m[2], approx: false };
  return null;
}

function splitContact(raw) {
  const s = (raw || '').trim();
  if (!s || s === '#ERROR!') return { telefono: null, whatsapp: null, contacto_extra: null };
  const telMatch = s.match(/(\+?\d[\d\s\-().]{7,}\d)/);
  const tel = telMatch ? telMatch[1].replace(/[\s\-()]/g, '') : null;
  const wa = /whatsapp|wa\.me/i.test(s) ? tel : null;
  const ig = s.match(/@[\w.]+/)?.[0];
  const url = s.match(/https?:\/\/[^\s,]+/)?.[0];
  const extra = [ig, url && !tel ? url : null].filter(Boolean).join(' · ') || null;
  return {
    telefono: tel && !/^@/.test(tel) ? tel : null,
    whatsapp: wa,
    contacto_extra: extra,
  };
}

function parseReciben(text) {
  if (!text) return [];
  const t = text.replace(/^reciben\s*/i, '').trim();
  return t.split(/[,·;]|(?:\s+y\s+)/i)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 80)
    .slice(0, 12);
}

function mapEstadoVzla(ciudadRaw, pais) {
  const c = (ciudadRaw || '').trim();
  if (pais !== 'Venezuela') return pais || 'Exterior';
  if (VE_ESTADOS.has(c)) return c;
  if (/caracas/i.test(c)) return 'Distrito Capital';
  if (/la guaira|vargas/i.test(c)) return 'La Guaira';
  if (/barquisimeto/i.test(c)) return 'Lara';
  if (/maracaibo/i.test(c)) return 'Zulia';
  if (/valencia/i.test(c)) return 'Carabobo';
  if (/maracay/i.test(c)) return 'Aragua';
  if (/barcelona|lecheria|puerto la cruz|el tigre/i.test(c)) return 'Anzoátegui';
  if (/san crist/i.test(c)) return 'Táchira';
  if (/matur/i.test(c)) return 'Monagas';
  if (/ciudad bol/i.test(c)) return 'Bolívar';
  return c || 'Otra';
}

function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function geocodeQuery(q) {
  if (!q) return null;
  if (geoCache.has(q)) return geoCache.get(q);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const cc = q.toLowerCase().includes('venezuela') ? 've' : '';
    const full = cc ? `${url}&countrycodes=${cc}` : url;
    const r = await fetch(full, { headers: { 'User-Agent': 'AyudaVenezuela/1.0 (import centros)' } });
    const j = await r.json();
    const out = j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
    geoCache.set(q, out);
    await sleep(1100);
    return out;
  } catch {
    return null;
  }
}

async function geocodeCascade(rec) {
  if (rec.source_url) {
    const fromMaps = parseMapsUrl(rec.source_url);
    if (fromMaps) return fromMaps;
  }
  const { direccion, ciudad, estado_vzla, pais } = rec;
  const queries = [
    [direccion, ciudad, pais].filter(Boolean).join(', '),
    [direccion, pais].filter(Boolean).join(', '),
    [ciudad, estado_vzla, pais].filter(Boolean).join(', '),
    [ciudad, pais].filter(Boolean).join(', '),
    pais === 'Venezuela' ? `${estado_vzla}, Venezuela` : null,
    pais === 'Venezuela' ? `${estado_vzla}, Venezuela` : `${pais}`,
  ].filter(Boolean);
  const seen = new Set();
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (seen.has(q)) continue;
    seen.add(q);
    const geo = await geocodeQuery(q);
    if (geo) return { ...geo, approx: i > 0 };
  }
  if (pais === 'Venezuela' && FALLBACK_VE[estado_vzla]) {
    const [lat, lng] = FALLBACK_VE[estado_vzla];
    return { lat, lng, approx: true };
  }
  return null;
}

async function fetchAcopio() {
  const r = await fetch(ACOPIO_API, { headers: { 'User-Agent': 'AyudaVenezuela/1.0' } });
  if (!r.ok) throw new Error(`Sheet2API ${r.status}`);
  return r.json();
}

async function fetchCavHtml() {
  const r = await fetch(CAV_URL, { headers: { 'User-Agent': 'AyudaVenezuela/1.0' } });
  if (!r.ok) throw new Error(`centrosayudavenezuela ${r.status}`);
  return r.text();
}

function parseCavHtml(html) {
  const out = [];
  for (const ch of html.split('<article class="cav-directory-card">').slice(1)) {
    const cityM = ch.match(/cav-directory-city[^>]*>\s*(?:&#128205;\s*|📍\s*)?([^<]+)/);
    const nameM = ch.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const addrM = ch.match(/cav-directory-address[^>]*>([^<]+)/);
    const supM = ch.match(/cav-directory-supplies[^>]*>\s*<p>([^<]*)/);
    const contactM = ch.match(/cav-directory-contact-info[^>]*>\s*<p>([^<]*)/);
    const mapM = ch.match(/href="(https:\/\/www\.google\.com\/maps[^"]+)"/);
    if (!nameM) continue;
    const loc = (cityM?.[1] || '').trim();
    const parts = loc.split(',').map(s => s.trim()).filter(Boolean);
    const pais = parts.length ? parts[parts.length - 1] : 'Venezuela';
    const ciudad = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');
    out.push({
      fuente: 'centrosayudavenezuela',
      nombre: nameM[1].trim(),
      direccion: (addrM?.[1] || '').trim(),
      ciudad,
      pais: /venezuela/i.test(pais) ? 'Venezuela' : pais,
      reciben_texto: (supM?.[1] || '').trim(),
      contacto_raw: (contactM?.[1] || '').trim(),
      source_url: mapM?.[1] || null,
    });
  }
  return out;
}

function normalizeAcopio(rows) {
  return rows.map(row => {
    const nombre = String(row['Quién'] || '').trim();
    const direccion = String(row['Dirección'] || '').trim();
    const ciudadRaw = String(row['Ciudad '] || row.Ciudad || '').trim();
    const pais = String(row['País'] || row.Pais || 'Venezuela').trim() || 'Venezuela';
    const paisNorm = /venezuela/i.test(pais) ? 'Venezuela' : pais;
    return {
      fuente: 'acopiovenezuela',
      nombre,
      direccion,
      ciudad: VE_ESTADOS.has(ciudadRaw) ? '' : ciudadRaw,
      pais: paisNorm,
      estado_hint: VE_ESTADOS.has(ciudadRaw) ? ciudadRaw : mapEstadoVzla(ciudadRaw, paisNorm),
      reciben_texto: String(row['Qué reciben'] || '').trim(),
      contacto_raw: String(row['Contacto'] || '').trim(),
      source_url: null,
    };
  }).filter(r => r.nombre && r.direccion);
}

function toRecord(raw) {
  const pais = raw.pais || 'Venezuela';
  const estado_vzla = raw.estado_hint || mapEstadoVzla(raw.ciudad, pais);
  const { telefono, whatsapp, contacto_extra } = splitContact(raw.contacto_raw);
  const hash = sourceHash(raw.fuente, raw.nombre, raw.direccion);
  return {
    nombre: raw.nombre.slice(0, 200),
    organizacion: null,
    estado_vzla: estado_vzla.slice(0, 80),
    direccion: raw.direccion.slice(0, 500),
    pais,
    ciudad: (raw.ciudad || '').slice(0, 120) || null,
    telefono,
    whatsapp,
    contacto_extra,
    reciben_texto: raw.reciben_texto || null,
    necesita_ahora: parseReciben(raw.reciben_texto),
    source_url: raw.source_url,
    fuente: raw.fuente,
    source_hash: hash,
    activo: true,
    notas: `__import_${raw.fuente}__`,
  };
}

function isNearDuplicate(existing, rec, radioM = 200) {
  const nameA = norm(rec.nombre).slice(0, 20);
  for (const e of existing) {
    if (!e.lat || !e.lng || !rec.lat || !rec.lng) continue;
    if (distM(e.lat, e.lng, rec.lat, rec.lng) > radioM) continue;
    const nameB = norm(e.nombre).slice(0, 20);
    if (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA)) return true;
  }
  return false;
}

async function main() {
  if (!DRY_RUN) {
    const missing = missingEnvKeys(['SUPABASE_KEY']);
    if (missing.length) {
      console.error('❌ Faltan en .env:', missing.join(', '));
      process.exit(1);
    }
  }

  console.error('📥 Descargando fuentes…');
  const [acopioRaw, cavHtml] = await Promise.all([fetchAcopio(), fetchCavHtml()]);
  const cavRows = parseCavHtml(cavHtml);
  const parsed = [
    ...normalizeAcopio(acopioRaw),
    ...cavRows,
  ];
  console.error(`   acopiovenezuela: ${acopioRaw.length} | centrosayudavenezuela: ${cavRows.length}`);

  const byHash = new Map();
  for (const raw of parsed) {
    const rec = toRecord(raw);
    if (ONLY_VE && rec.pais !== 'Venezuela') continue;
    if (!byHash.has(rec.source_hash)) byHash.set(rec.source_hash, rec);
  }
  let candidates = [...byHash.values()];
  if (LIMIT > 0) candidates = candidates.slice(0, LIMIT);

  let existing = [];
  let existingHashes = new Set();
  if (!DRY_RUN) {
    const db = createClient(SB_URL, SB_KEY);
    const { data, error } = await db.from('centros_acopio')
      .select('source_hash, nombre, lat, lng');
    if (error) throw new Error(error.message);
    existing = data || [];
    existingHashes = new Set(existing.map(r => r.source_hash).filter(Boolean));
  }

  const stats = { skip_hash: 0, skip_geo: 0, skip_nogeo: 0, ok: 0 };
  const toInsert = [];

  for (const rec of candidates) {
    if (existingHashes.has(rec.source_hash)) {
      stats.skip_hash++;
      continue;
    }
    const geo = await geocodeCascade(rec);
    if (!geo) {
      stats.skip_nogeo++;
      console.error(`  ⏭ sin coords: ${rec.nombre} (${rec.pais})`);
      continue;
    }
    rec.lat = geo.lat;
    rec.lng = geo.lng;
    rec.ubicacion_aproximada = !!geo.approx;
    if (isNearDuplicate([...existing, ...toInsert], rec)) {
      stats.skip_geo++;
      continue;
    }
    toInsert.push(rec);
    stats.ok++;
    console.error(`  ✓ ${rec.nombre} | ${rec.ciudad || rec.estado_vzla}, ${rec.pais} | ${rec.lat.toFixed(4)}, ${rec.lng.toFixed(4)}${rec.ubicacion_aproximada ? ' ~' : ''}`);
  }

  console.error('\n=== Resumen ===');
  console.error(`Candidatos únicos: ${candidates.length}`);
  console.error(`Insertar: ${toInsert.length}`);
  console.error(`Skip hash existente: ${stats.skip_hash}`);
  console.error(`Skip dup geo: ${stats.skip_geo}`);
  console.error(`Skip sin geocode: ${stats.skip_nogeo}`);
  console.error(`Venezuela: ${toInsert.filter(r => r.pais === 'Venezuela').length} | Intl: ${toInsert.filter(r => r.pais !== 'Venezuela').length}`);

  if (DRY_RUN) {
    console.error('\n(dry-run — no se escribió en Supabase)');
    return;
  }

  const db = createClient(SB_URL, SB_KEY);
  const CHUNK = 40;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { error } = await db.from('centros_acopio').insert(chunk);
    if (error) throw new Error(`insert: ${error.message}`);
    inserted += chunk.length;
  }
  console.error(`\n✅ Insertados ${inserted} centros en Supabase`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
