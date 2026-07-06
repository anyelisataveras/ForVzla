#!/usr/bin/env node
/**
 * Asigna brigadas por perfil a voluntarias sin brigadas.
 * Funciona con service_role aunque la RPC aún no tenga el fix de permisos.
 *
 *   node scripts/asignar_brigadas_fit.js
 *   REASIGNAR=1 node scripts/asignar_brigadas_fit.js
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const GRUPO = process.env.GRUPO || 'cuidadoras_caracas';
const REASIGNAR = process.env.REASIGNAR === '1';
const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('Falta SUPABASE_KEY en .env');
  process.exit(1);
}

const db = createClient(SB_URL, SB_KEY);

function normText(...parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function scoreBrigada(texto, slug, tieneHijos, transporte) {
  let score = 0;
  const hijos = ['si', 'sí', 'yes'].includes(String(tieneHijos || '').trim().toLowerCase());

  switch (slug) {
    case 'logistica_alimentos':
      if (/(chef|cocin|gastron|aliment|nutric|pasteler|panader|comida|culinar|reposter|gastronomi|cheff)/.test(texto)) score += 10;
      if (['carro', 'camioneta'].includes(transporte)) score += 2;
      break;
    case 'salud_medicamentos':
      if (/(medic|enfermer|doctor|odontolog|farmac|salud|fisioterap|paramed|bioanal|laborator|odontol|enfermeria|obstetr|pediatr|auxiliar)/.test(texto)) score += 10;
      if (/(primeros auxilios|primer auxilio)/.test(texto)) score += 6;
      break;
    case 'clasificacion_donaciones':
      if (/(costur|modist|organiz|inventar|almacen|clasific|donacion|ropa|textil|bodega|comercio)/.test(texto)) score += 10;
      if (/(logist|distribuc)/.test(texto)) score += 4;
      break;
    case 'saneamiento':
      if (/(limpiez|aseo|mantenim|higien|conserj|jardiner|aseador|servicio general)/.test(texto)) score += 10;
      if (/(orden|organizacion del hogar)/.test(texto)) score += 4;
      break;
    case 'recreacion':
      if (/(educacion|maestr|profesor|preescolar|infantil|nino|nina|recreacion|deport|pedagog|puericultor|docent|guarderi|animador|lic\.?\s*educ)/.test(texto)) score += 10;
      if (hijos) score += 3;
      if (/(experiencia con nino|trabajo con nino|ama de casa)/.test(texto)) score += 4;
      break;
    case 'contencion':
      if (/(psicolog|psiquiatr|trabajador social|terapeuta|contencion|escucha|emocional|consejer|psico|consejeria|trabajo social)/.test(texto)) score += 10;
      if (hijos) score += 2;
      break;
    case 'social':
      if (/(sociolog|administr|gestion|abogad|derecho|comunicacion|relaciones public|recursos humanos|trabajo comunitario|orientacion)/.test(texto)) score += 8;
      score += 1;
      break;
    default:
      break;
  }
  return score;
}

function sugerirBrigadas(vol, brigadas, max = 2) {
  const texto = normText(vol.profesion, vol.oficio, vol.tareas, vol.fortalezas, vol.observaciones_logistica);
  const scored = brigadas
    .map((b) => ({
      slug: b.slug,
      puntaje: scoreBrigada(texto, b.slug, vol.tiene_hijos, vol.medio_transporte),
      orden: b.orden ?? 99,
    }))
    .sort((a, b) => b.puntaje - a.puntaje || a.orden - b.orden || a.slug.localeCompare(b.slug));

  const top = scored[0]?.puntaje ?? 0;
  const picked = scored.filter((s, i) => {
    if (s.puntaje <= 0) return false;
    if (i === 0) return true;
    return i === 1 && s.puntaje >= 5 && s.puntaje >= top - 3;
  }).slice(0, max);

  if (picked.length) return picked.map((p) => p.slug);

  const social = brigadas.find((b) => b.slug === 'social');
  if (social) return [social.slug];
  return brigadas.length ? [brigadas[0].slug] : [];
}

async function viaRpc() {
  const { data, error } = await db.rpc('asignar_brigadas_por_fit_grupo', {
    p_grupo: GRUPO,
    p_solo_sin_brigadas: !REASIGNAR,
    p_max_por_voluntaria: 2,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: data?.error || 'RPC falló' };
  return { ok: true, data };
}

async function viaDirect() {
  const { data: brigadas, error: eBrig } = await db
    .from('brigadas')
    .select('slug,orden')
    .eq('grupo', GRUPO)
    .eq('activa', true)
    .order('orden');
  if (eBrig) throw new Error(eBrig.message);

  let q = db
    .from('voluntarios')
    .select('id,numero_voluntaria,nombre,apellido,profesion,oficio,tareas,fortalezas,observaciones_logistica,tiene_hijos,medio_transporte,brigadas')
    .eq('grupo', GRUPO)
    .eq('activa', true)
    .order('numero_voluntaria');
  const { data: vols, error: eVol } = await q;
  if (eVol) throw new Error(eVol.message);

  const targets = (vols || []).filter((v) => REASIGNAR || !v.brigadas?.length);
  let asignadas = 0;
  const detalle = [];

  for (const v of targets) {
    const brig = sugerirBrigadas(v, brigadas || [], 2);
    const { error } = await db.from('voluntarios').update({ brigadas: brig }).eq('id', v.id);
    if (error) {
      console.error(`#${v.numero_voluntaria} ${v.nombre}:`, error.message);
      continue;
    }
    asignadas += 1;
    detalle.push({ numero_voluntaria: v.numero_voluntaria, nombre: v.nombre, apellido: v.apellido, brigadas: brig });
  }

  return { ok: true, data: { grupo: GRUPO, asignadas, omitidas: targets.length - asignadas, detalle } };
}

let result = await viaRpc();
if (!result.ok) {
  console.log('RPC no disponible (' + result.error + ') — asignando directo…');
  result = await viaDirect();
}

if (!result.ok) {
  console.error('Error:', result.error);
  process.exit(1);
}

const data = result.data;
console.log(`Grupo: ${data.grupo}`);
console.log(`Asignadas: ${data.asignadas}, omitidas: ${data.omitidas ?? 0}`);

const detalle = Array.isArray(data.detalle) ? data.detalle : [];
if (detalle.length) {
  console.log('\nPrimeras 10:');
  detalle.slice(0, 10).forEach((d) => {
    const brig = Array.isArray(d.brigadas) ? d.brigadas.join(', ') : '';
    console.log(`  #${d.numero_voluntaria} ${d.nombre} ${d.apellido} → ${brig}`);
  });
}
