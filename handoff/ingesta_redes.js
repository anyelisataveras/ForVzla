#!/usr/bin/env node
/**
 * ingesta_redes.js — Ayuda Venezuela
 * ---------------------------------------------------------------
 * Convierte posts públicos de Instagram y TikTok (gente pidiendo
 * ayuda por el terremoto) en filas estructuradas de `necesidades`,
 * EVITANDO DUPLICADOS.
 *
 * Flujo:
 *   1) Apify scrapea por hashtags/keywords (solo data pública, sin login).
 *   2) Claude (Haiku) clasifica cada post: ¿es una necesidad? tipo,
 *      urgencia, zona, contacto, cantidad...
 *   3) Dedup en 3 capas:
 *        a) source_hash único  (mismo post nunca entra dos veces)
 *        b) geo + tipo (<200 m, mismo tipo)  -> suma confirmación
 *        c) coordinador modera lo demás (validada=false)
 *   4) Inserta en Supabase con fuente='instagram' | 'tiktok'.
 *
 * Actores Apify (verificados jun-2026):
 *   Instagram: apify/instagram-search-scraper  (hashtag / keyword)
 *   TikTok:    clockworks/tiktok-scraper        (hashtag / search)
 *
 * Ejecutar:  node ingesta_redes.js
 * Requiere Node 18+ (fetch nativo).
 * ---------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// ── CONFIG (usa variables de entorno; no comitees claves) ──
const APIFY_TOKEN   = process.env.APIFY_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SB_URL        = process.env.SUPABASE_URL  || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY        = process.env.SUPABASE_KEY; // service_role para escritura masiva
const DRY_RUN       = process.env.DRY_RUN === '1'; // 1 = no escribe, solo muestra

const HASHTAGS = [
  'AyudaVenezuela','TerremotoVenezuela','TerremotoYaracuy','LaGuaira',
  'SismoVenezuela','Caraballeda','VenezuelaTerremoto','SOSVenezuela'
];
const KEYWORDS = [
  'necesitamos ayuda La Guaira','edificio colapsado Venezuela',
  'personas atrapadas terremoto','centro de acopio Venezuela terremoto'
];
const MAX_POR_FUENTE = 120;        // límite por corrida (controla costo Apify)
const RADIO_DUP_M    = 200;        // radio para considerar duplicado geográfico

const db = SB_KEY ? createClient(SB_URL, SB_KEY) : null;

// ===============================================================
// 1) APIFY
// ===============================================================
async function runApifyActor(actorId, input) {
  // run-sync-get-dataset-items: lanza y espera resultado en una llamada
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(`Apify ${actorId} -> ${res.status} ${await res.text()}`);
  return res.json(); // array de items
}

async function scrapeInstagram() {
  console.log('📸 Instagram...');
  const items = await runApifyActor('apify~instagram-search-scraper', {
    search: HASHTAGS.join(' '),
    searchType: 'hashtag',
    resultsLimit: MAX_POR_FUENTE
  });
  return items.map(it => ({
    plataforma: 'instagram',
    post_id: it.id || it.shortCode || it.url,
    url: it.url || (it.shortCode ? `https://instagram.com/p/${it.shortCode}` : null),
    texto: it.caption || it.text || '',
    usuario: it.ownerUsername || it.ownerFullName || '',
    ubicacion_post: it.locationName || null,
    ts: it.timestamp || null
  }));
}

async function scrapeTikTok() {
  console.log('🎵 TikTok...');
  const items = await runApifyActor('clockworks~tiktok-scraper', {
    hashtags: HASHTAGS,
    searchQueries: KEYWORDS,
    resultsPerPage: MAX_POR_FUENTE,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false
  });
  return items.map(it => ({
    plataforma: 'tiktok',
    post_id: it.id || it.webVideoUrl,
    url: it.webVideoUrl || null,
    texto: it.text || it.desc || '',
    usuario: it.authorMeta?.name || it.authorMeta?.nickName || '',
    ubicacion_post: it.locationCreated || null,
    ts: it.createTimeISO || null
  }));
}

// ===============================================================
// 2) EXTRACCIÓN CON CLAUDE (clasifica + estructura)
// ===============================================================
const SYS = `Eres un clasificador de emergencias del terremoto de Venezuela (24-jun-2026).
Recibes el texto de un post de redes sociales. Devuelve SOLO un JSON (sin markdown) con:
{
 "es_necesidad": boolean,        // true solo si alguien PIDE ayuda/recursos concretos
 "tipo": string,                 // uno de: Rescate, Agua potable, Alimentos, Medicamentos, Médicos / paramédicos, Refugio / carpas, Sangre / donantes, Transporte, Ropa / abrigo, Comunicación / radios, Herramientas / Equipos, Otra
 "urgencia": "critica"|"urgente"|"normal",
 "zona": string,                 // estado o zona de Venezuela mencionada, o ""
 "direccion": string,            // referencia/dirección/edificio mencionado, o ""
 "descripcion": string,          // resumen claro de qué necesitan (1-2 frases, español)
 "cantidad": string,             // cantidad/personas si se menciona, o ""
 "telefono": string,             // teléfono si aparece en el texto, o ""
 "confianza": number             // 0..1 qué tan seguro estás de que es una necesidad real
}
Si el post no pide ayuda (es noticia, opinión, donación ofrecida, etc.) -> es_necesidad=false.`;

async function clasificar(texto) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYS,
      messages: [{ role: 'user', content: texto.slice(0, 1500) }]
    })
  });
  if (!res.ok) { console.warn('Claude', res.status); return null; }
  const data = await res.json();
  const raw = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { return null; }
}

// ===============================================================
// 3) GEOCODING (best-effort, OSM Nominatim) para habilitar dedup geográfico
// ===============================================================
const geoCache = new Map();
async function geocode(q) {
  if (!q) return null;
  if (geoCache.has(q)) return geoCache.get(q);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ', Venezuela')}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'AyudaVenezuela/1.0 (emergencia)' } });
    const j = await r.json();
    const out = j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
    geoCache.set(q, out);
    await sleep(1100); // respetar rate limit de Nominatim (1 req/s)
    return out;
  } catch { return null; }
}

// ===============================================================
// 4) DEDUP + INSERT
// ===============================================================
function hashPost(plataforma, post_id) {
  return crypto.createHash('sha256').update(`${plataforma}:${post_id}`).digest('hex').slice(0, 32);
}

async function yaExisteHash(hash) {
  const { data } = await db.from('necesidades').select('id').eq('source_hash', hash).limit(1);
  return data && data.length > 0;
}

async function duplicadoGeografico(lat, lng, tipo) {
  if (lat == null || lng == null) return null;
  const { data } = await db.rpc('necesidades_cercanas',
    { p_lat: lat, p_lng: lng, p_radio_m: RADIO_DUP_M, p_tipo: tipo });
  return (data && data.length) ? data[0] : null;
}

async function procesar(post) {
  const hash = hashPost(post.plataforma, post.post_id);

  if (!DRY_RUN && await yaExisteHash(hash)) { return { estado: 'skip_hash' }; }

  const c = await clasificar(post.texto);
  if (!c || !c.es_necesidad || (c.confianza ?? 0) < 0.55) return { estado: 'no_necesidad' };

  // intenta coordenadas a partir de la dirección/zona del post
  let geo = post.ubicacion_post ? await geocode(post.ubicacion_post) : null;
  if (!geo && c.direccion) geo = await geocode(`${c.direccion} ${c.zona}`);
  if (!geo && c.zona)      geo = await geocode(c.zona);

  // dedup geográfico -> en vez de duplicar, suma confirmación
  if (db && geo) {
    const dup = await duplicadoGeografico(geo.lat, geo.lng, c.tipo);
    if (dup) {
      if (!DRY_RUN) await db.rpc('confirmar_necesidad', { p_id: dup.id });
      return { estado: 'confirmado_existente', id: dup.id };
    }
  }

  const fila = {
    zona: c.zona || 'Otra',
    direccion_exacta: c.direccion || post.ubicacion_post || `(de ${post.plataforma} @${post.usuario})`,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    tipo: c.tipo || 'Otra',
    urgencia: ['critica', 'urgente', 'normal'].includes(c.urgencia) ? c.urgencia : 'urgente',
    descripcion: c.descripcion || post.texto.slice(0, 280),
    cantidad: c.cantidad || null,
    nombre_contacto: post.usuario ? `@${post.usuario}` : 'Reporte de redes',
    telefono: c.telefono || 's/d',
    fuente: post.plataforma,
    source_url: post.url,
    source_hash: hash,
    validada: false,           // coordinador modera antes de darle peso
    estado: 'pendiente'
  };

  if (DRY_RUN) { console.log('DRY', fila.tipo, fila.zona, '-', fila.descripcion); return { estado: 'dry' }; }

  const { error } = await db.from('necesidades').insert(fila);
  if (error) { console.warn('insert', error.message); return { estado: 'error' }; }
  return { estado: 'insertado' };
}

// ===============================================================
// MAIN
// ===============================================================
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!APIFY_TOKEN)   throw new Error('Falta APIFY_TOKEN');
  if (!ANTHROPIC_KEY) throw new Error('Falta ANTHROPIC_API_KEY');
  if (!DRY_RUN && !SB_KEY) throw new Error('Falta SUPABASE_KEY (service_role)');

  let posts = [];
  try { posts = posts.concat(await scrapeInstagram()); } catch (e) { console.warn('IG', e.message); }
  try { posts = posts.concat(await scrapeTikTok()); }    catch (e) { console.warn('TikTok', e.message); }

  // dedup local por hash de post antes de tocar la BD
  const vistos = new Set();
  posts = posts.filter(p => p.post_id && !vistos.has(p.post_id) && vistos.add(p.post_id));
  console.log(`📥 ${posts.length} posts únicos recolectados`);

  const tally = {};
  for (const p of posts) {
    try {
      const r = await procesar(p);
      tally[r.estado] = (tally[r.estado] || 0) + 1;
    } catch (e) { console.warn('proc', e.message); tally.error = (tally.error || 0) + 1; }
  }
  console.log('\n📊 Resumen:', tally);
  console.log('Los nuevos entran como validada=false. Modera en Supabase > Table Editor.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
