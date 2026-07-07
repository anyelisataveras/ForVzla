#!/usr/bin/env node
/**
 * Borra voluntarias del grupo y reimporta desde CSV del sistema anterior,
 * preservando numero_voluntaria y asignando brigadas por perfil.
 *
 *   CONFIRM=1 node scripts/remigrar_voluntarias_csv.js
 *   CONFIRM=1 CSV_PATH=/ruta/archivo.csv node scripts/remigrar_voluntarias_csv.js
 *   DRY_RUN=1 node scripts/remigrar_voluntarias_csv.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const GRUPO = process.env.GRUPO || 'cuidadoras_caracas';
const DRY_RUN = process.env.DRY_RUN === '1';
const CONFIRM = process.env.CONFIRM === '1';
const CSV_PATH = process.env.CSV_PATH
  || '/Users/a/Downloads/voluntarias_export_2026-07-06.csv';
const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('Faltan variables:', missing.join(', '));
  process.exit(1);
}

if (!DRY_RUN && !CONFIRM) {
  console.error('Para borrar e importar de verdad: CONFIRM=1 node scripts/remigrar_voluntarias_csv.js');
  process.exit(1);
}

/** RFC 4180 básico con campos multilínea entre comillas. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

function parseRedSocial(raw) {
  const s = String(raw || '').trim();
  if (!s) return { plataforma: null, usuario: null };
  const m = s.match(/^([^-]+?)\s*-\s*(.+)$/);
  if (!m) return { plataforma: null, usuario: s };
  let plataforma = m[1].trim();
  const usuario = m[2].trim();
  if (/^correo$/i.test(plataforma)) plataforma = 'Gmail';
  if (/^instagram$/i.test(plataforma)) plataforma = 'Instagram';
  if (/^x$/i.test(plataforma)) plataforma = 'X';
  return { plataforma, usuario };
}

function mapTieneHijos(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^no$/i.test(s)) return 'No';
  if (/^si/i.test(s) || /^\d/.test(s) || /\(M:/i.test(s)) return 'Si';
  return s;
}

function mapEdad(raw) {
  const n = parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normId(v) {
  if (!v) return '';
  return String(v).replace(/\s+/g, '').toUpperCase();
}

function rowToRecord(cols, headerIndex) {
  const get = (name) => {
    const i = headerIndex[name];
    return i == null ? '' : String(cols[i] ?? '').trim();
  };

  const numero = parseInt(get('N° Voluntaria') || get('numero') || get('Nº Voluntaria'), 10);
  const rs = parseRedSocial(get('Red Social'));

  return {
    grupo: GRUPO,
    numero_voluntaria: Number.isFinite(numero) ? numero : undefined,
    nombre: get('Nombre'),
    apellido: get('Apellido'),
    id_dni: get('ID/DNI') || get('cedula'),
    edad: mapEdad(get('Edad')),
    estado_civil: get('Estado Civil') || null,
    telefono: get('Teléfono') || get('Telefono'),
    profesion: get('Profesión') || get('Profesion') || null,
    oficio: get('Oficio') || null,
    disponibilidad: get('Disponibilidad') || null,
    pais: get('País') || get('Pais') || null,
    estado_provincia: get('Estado') || null,
    ciudad: get('Ciudad') || null,
    direccion: get('Dirección') || get('Direccion') || null,
    red_social_plataforma: rs.plataforma,
    red_social_usuario: rs.usuario,
    tiene_hijos: mapTieneHijos(get('Hijos')),
    hijos: [],
    tareas: get('Tareas') || null,
    fortalezas: get('Fortalezas') || null,
    declaracion_jurada: /^aceptada$/i.test(get('Declaración Jurada') || get('Declaracion Jurada')),
    brigadas: [],
  };
}

function validRow(row) {
  if (!row.nombre || !row.apellido) return 'sin nombre/apellido';
  if (!row.id_dni) return 'sin cédula';
  if (!row.telefono) return 'sin teléfono';
  if (!row.numero_voluntaria) return 'sin número de voluntaria';
  return null;
}

function buildHeaderIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });
  return idx;
}

// ── Brigadas (misma heurística que asignar_brigadas_fit.js) ──

function normText(...parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function scoreBrigada(texto, slug, tieneHijos) {
  let score = 0;
  const hijos = ['si', 'sí', 'yes'].includes(String(tieneHijos || '').trim().toLowerCase());

  switch (slug) {
    case 'logistica_alimentos':
      if (/(chef|cocin|gastron|aliment|nutric|pasteler|panader|comida|culinar|reposter|gastronomi|cheff)/.test(texto)) score += 10;
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
  const texto = normText(vol.profesion, vol.oficio, vol.tareas, vol.fortalezas);
  const scored = brigadas
    .map((b) => ({
      slug: b.slug,
      puntaje: scoreBrigada(texto, b.slug, vol.tiene_hijos),
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

async function syncSequence() {
  const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    console.warn('Sin SUPABASE_DB_URL — sincroniza la secuencia manualmente si hace falta.');
    return;
  }
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`
    select setval(
      pg_get_serial_sequence('voluntarios', 'numero_voluntaria'),
      coalesce((select max(numero_voluntaria) from voluntarios), 1)
    )
  `);
  await client.end();
  console.log('Secuencia numero_voluntaria sincronizada.');
}

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error('No existe CSV:', CSV_PATH);
    process.exit(1);
  }

  const parsed = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  if (parsed.length < 2) {
    console.error('CSV vacío o sin datos');
    process.exit(1);
  }

  const headerIndex = buildHeaderIndex(parsed[0]);
  const db = createClient(SB_URL, SB_KEY);

  const toInsert = [];
  const skipped = [];
  const invalid = [];
  const sinRed = [];
  const seenDni = new Map();
  const seenNum = new Set();

  for (const cols of parsed.slice(1)) {
    const row = rowToRecord(cols, headerIndex);
    const bad = validRow(row);
    if (bad) {
      invalid.push({ num: row.numero_voluntaria, name: `${row.nombre} ${row.apellido}`.trim(), reason: bad });
      continue;
    }

    const dniKey = normId(row.id_dni);
    if (seenDni.has(dniKey)) {
      skipped.push({
        num: row.numero_voluntaria,
        name: `${row.nombre} ${row.apellido}`,
        reason: `cédula duplicada (ya importada como #${seenDni.get(dniKey)})`,
      });
      continue;
    }
    if (seenNum.has(row.numero_voluntaria)) {
      skipped.push({
        num: row.numero_voluntaria,
        name: `${row.nombre} ${row.apellido}`,
        reason: 'número de voluntaria duplicado en CSV',
      });
      continue;
    }

    if (!row.red_social_plataforma || !row.red_social_usuario) {
      sinRed.push({ num: row.numero_voluntaria, name: `${row.nombre} ${row.apellido}` });
    }

    seenDni.set(dniKey, row.numero_voluntaria);
    seenNum.add(row.numero_voluntaria);
    toInsert.push(row);
  }

  toInsert.sort((a, b) => a.numero_voluntaria - b.numero_voluntaria);

  console.log(`Grupo: ${GRUPO}`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Filas CSV: ${parsed.length - 1} → importar: ${toInsert.length} | omitir: ${skipped.length} | inválidas: ${invalid.length}`);

  if (invalid.length) {
    console.log('\nInválidas:');
    invalid.forEach((x) => console.log(`  #${x.num || '?'} ${x.name}: ${x.reason}`));
  }
  if (skipped.length) {
    console.log('\nOmitidas:');
    skipped.forEach((x) => console.log(`  #${x.num} ${x.name}: ${x.reason}`));
  }
  if (sinRed.length) {
    console.log(`\nSin red social (${sinRed.length}) — no podrán entrar hasta completar en coord:`);
    sinRed.forEach((x) => console.log(`  #${x.num} ${x.name}`));
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] Primeras 3 filas:');
    toInsert.slice(0, 3).forEach((r) => console.log(JSON.stringify(r, null, 2)));
    return;
  }

  const { count: antes, error: eCount } = await db
    .from('voluntarios')
    .select('*', { count: 'exact', head: true })
    .eq('grupo', GRUPO);
  if (eCount) {
    console.error('Error contando voluntarios:', eCount.message);
    process.exit(1);
  }

  console.log(`\nBorrando ${antes ?? 0} voluntarias existentes en ${GRUPO}…`);
  const { error: eDel } = await db.from('voluntarios').delete().eq('grupo', GRUPO);
  if (eDel) {
    console.error('Error borrando:', eDel.message);
    process.exit(1);
  }

  let ok = 0;
  const BATCH = 25;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await db.from('voluntarios').insert(batch);
    if (error) {
      console.error('Error insertando lote', Math.floor(i / BATCH) + 1, error.message);
      process.exit(1);
    }
    ok += batch.length;
    process.stdout.write(`\rInsertadas ${ok}/${toInsert.length}...`);
  }
  console.log(`\n✓ ${ok} voluntarias importadas`);

  await syncSequence();

  const { data: brigadas, error: eBrig } = await db
    .from('brigadas')
    .select('slug,orden')
    .eq('grupo', GRUPO)
    .eq('activa', true)
    .order('orden');
  if (eBrig) {
    console.error('Error leyendo brigadas:', eBrig.message);
    process.exit(1);
  }

  const { data: vols, error: eVol } = await db
    .from('voluntarios')
    .select('id,numero_voluntaria,nombre,apellido,profesion,oficio,tareas,fortalezas,tiene_hijos')
    .eq('grupo', GRUPO)
    .order('numero_voluntaria');
  if (eVol) {
    console.error('Error leyendo voluntarias:', eVol.message);
    process.exit(1);
  }

  let brigadasOk = 0;
  for (const v of vols || []) {
    const brig = sugerirBrigadas(v, brigadas || [], 2);
    const { error } = await db.from('voluntarios').update({ brigadas: brig }).eq('id', v.id);
    if (error) {
      console.error(`#${v.numero_voluntaria} ${v.nombre}:`, error.message);
      continue;
    }
    brigadasOk++;
  }
  console.log(`✓ Brigadas asignadas a ${brigadasOk}/${vols?.length ?? 0} voluntarias`);

  const maxNum = toInsert.reduce((m, r) => Math.max(m, r.numero_voluntaria), 0);
  console.log(`Número más alto: ${maxNum}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
