#!/usr/bin/env node
/**
 * Importa voluntarias desde data/voluntarias_maestro.json → tabla voluntarios.
 * Grupo por defecto: cuidadoras_caracas
 *
 * Requiere migración 20250705230000_voluntarios_grupos.sql
 * y SUPABASE_KEY (service_role) en ForVzla/.env
 *
 * Uso:
 *   DRY_RUN=1 node scripts/import_voluntarios_maestro.js
 *   node scripts/import_voluntarios_maestro.js
 *   GRUPO=cuidadoras_caracas node scripts/import_voluntarios_maestro.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const GRUPO = process.env.GRUPO || 'cuidadoras_caracas';
const DRY_RUN = process.env.DRY_RUN === '1';
const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
const DATA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../data/voluntarias_maestro.json');

const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('Faltan variables:', missing.join(', '));
  process.exit(1);
}

function normId(v) {
  if (!v) return '';
  return String(v).replace(/\s+/g, '').toUpperCase();
}

function normDisp(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.trim() || null;
  return String(v);
}

function mapRecord(r) {
  const u = r.ubicacion || {};
  const rs = r.redSocial || {};
  const lg = r.logistica || {};
  const hijos = Array.isArray(r.hijos)
    ? r.hijos.filter(h => h && (h.sexo || h.edad != null)).map(h => ({
        sexo: h.sexo || null,
        edad: h.edad != null ? Number(h.edad) : null,
      }))
    : [];

  return {
    grupo: GRUPO,
    numero_voluntaria: r.numeroVoluntaria != null ? Number(r.numeroVoluntaria) : undefined,
    nombre: (r.nombre || '').trim(),
    apellido: (r.apellido || '').trim(),
    edad: r.edad != null ? Number(r.edad) : null,
    estado_civil: r.estadoCivil || null,
    id_dni: String(r.idDni || '').trim(),
    telefono: String(r.telefono || '').trim(),
    pais: u.pais || null,
    estado_provincia: u.estado || null,
    ciudad: u.ciudad || null,
    direccion: u.direccion || null,
    red_social_plataforma: rs.plataforma || null,
    red_social_usuario: rs.usuario || null,
    profesion: r.profesion || null,
    oficio: r.oficio || null,
    disponibilidad: normDisp(r.disponibilidad),
    tiene_hijos: r.tieneHijos || (hijos.length ? 'Si' : null),
    hijos,
    tareas: r.tareas || null,
    fortalezas: r.fortalezas || null,
    declaracion_jurada: r.declaracionJurada !== false,
    asistencia_zona: lg.asistencia_zona || null,
    medio_transporte: lg.medio_transporte || null,
    observaciones_logistica: lg.observaciones || null,
  };
}

function validRow(row) {
  if (!row.nombre || !row.apellido) return 'sin nombre/apellido';
  if (!row.id_dni) return 'sin cédula';
  if (!row.telefono) return 'sin teléfono';
  return null;
}

async function main() {
  if (!existsSync(DATA_PATH)) {
    console.error('No existe', DATA_PATH);
    process.exit(1);
  }

  const maestro = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const raw = maestro.records || [];
  const db = createClient(SB_URL, SB_KEY);

  const { data: existing, error: errExisting } = await db
    .from('voluntarios')
    .select('id_dni')
    .eq('grupo', GRUPO);
  if (errExisting) {
    console.error('Error leyendo voluntarios existentes:', errExisting.message);
    process.exit(1);
  }

  const have = new Set((existing || []).map(r => normId(r.id_dni)));
  const toInsert = [];
  const skipped = [];
  const invalid = [];
  const seen = new Set();

  for (const r of raw) {
    const row = mapRecord(r);
    const bad = validRow(row);
    if (bad) {
      invalid.push({ name: `${row.nombre} ${row.apellido}`, reason: bad });
      continue;
    }
    const key = normId(row.id_dni);
    if (seen.has(key)) {
      skipped.push({ name: `${row.nombre} ${row.apellido}`, reason: 'duplicado en JSON' });
      continue;
    }
    seen.add(key);
    if (have.has(key)) {
      skipped.push({ name: `${row.nombre} ${row.apellido}`, reason: 'ya en BD' });
      continue;
    }
    toInsert.push(row);
  }

  console.log(`Grupo: ${GRUPO}`);
  console.log(`Fuente: ${raw.length} registros en maestro`);
  console.log(`Insertar: ${toInsert.length} | Omitir: ${skipped.length} | Inválidos: ${invalid.length}`);

  if (invalid.length) {
    console.log('\nInválidos:');
    invalid.forEach(x => console.log(`  - ${x.name}: ${x.reason}`));
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] Primeras 3 filas a insertar:');
    toInsert.slice(0, 3).forEach(r => console.log(JSON.stringify(r, null, 2)));
    return;
  }

  let ok = 0;
  const BATCH = 25;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await db.from('voluntarios').insert(batch);
    if (error) {
      console.error('Error insertando lote', i / BATCH + 1, error.message);
      process.exit(1);
    }
    ok += batch.length;
    process.stdout.write(`\rInsertadas ${ok}/${toInsert.length}...`);
  }

  console.log(`\n✓ ${ok} voluntarias importadas en ${GRUPO}`);

  // Ajustar secuencia al máximo numero_voluntaria
  const { data: maxRow } = await db
    .from('voluntarios')
    .select('numero_voluntaria')
    .eq('grupo', GRUPO)
    .order('numero_voluntaria', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxRow?.numero_voluntaria) {
    console.log(`Número más alto: ${maxRow.numero_voluntaria} (nuevos registros continuarán desde ahí si la secuencia está al día)`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
