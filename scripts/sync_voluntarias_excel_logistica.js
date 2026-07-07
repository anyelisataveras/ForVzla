#!/usr/bin/env node
/**
 * Cruza Excel de logística (Caracas / La Guaira) con voluntarios en BD
 * y actualiza medio_transporte, asistencia_zona y observaciones_logistica.
 *
 *   DRY_RUN=1 node scripts/sync_voluntarias_excel_logistica.js
 *   node scripts/sync_voluntarias_excel_logistica.js
 *   XLSX_PATH="/ruta/archivo.xlsx" node scripts/sync_voluntarias_excel_logistica.js
 */
import XLSX from 'xlsx';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const GRUPO = process.env.GRUPO || 'cuidadoras_caracas';
const DRY_RUN = process.env.DRY_RUN === '1';
const XLSX_PATH = process.env.XLSX_PATH
  || '/Users/a/Downloads/Voluntarias Caracas y la Guaira (1).xlsx';
const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('Faltan variables:', missing.join(', '));
  process.exit(1);
}

function normCedula(v) {
  const s = String(v ?? '').replace(/\D/g, '');
  return s.replace(/^0+/, '') || s;
}

function mapTransporte(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || /no tiene|sin transporte|^no$|ninguno/.test(s)) return 'sin_transporte';
  if (/camioneta/.test(s)) return 'camioneta';
  if (/moto/.test(s)) return 'moto';
  if (/carro|auto|veh[ií]culo/.test(s)) return 'carro';
  return 'sin_transporte';
}

function mapZona(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/ccs.*guaira|caracas.*guaira|guaira.*ccs|guaira.*caracas/i.test(s)) return 'Ccs o La Guaira';
  if (/^la guaira$/i.test(s)) return 'La Guaira';
  if (/caracas/i.test(s)) return 'Caracas';
  return s;
}

function matchVol(row, byNum, byCed) {
  const num = Number(row['N° Voluntaria']) || null;
  const ced = normCedula(row.Cedula);
  if (num && byNum.has(num)) return byNum.get(num);
  if (ced && byCed.has(ced)) return byCed.get(ced);
  return null;
}

async function main() {
  if (!existsSync(XLSX_PATH)) {
    console.error('No existe:', XLSX_PATH);
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  const db = createClient(SB_URL, SB_KEY);

  const { data: vols, error } = await db
    .from('voluntarios')
    .select('id,numero_voluntaria,nombre,apellido,id_dni,medio_transporte,asistencia_zona,observaciones_logistica')
    .eq('grupo', GRUPO)
    .order('numero_voluntaria');
  if (error) {
    console.error('Error leyendo voluntarios:', error.message);
    process.exit(1);
  }

  const byNum = new Map((vols || []).map((v) => [v.numero_voluntaria, v]));
  const byCed = new Map((vols || []).map((v) => [normCedula(v.id_dni), v]));

  const registered = [];
  const notRegistered = [];
  const updates = [];

  for (const row of rows) {
    const excelNombre = String(row['Nombre '] || row.Nombre || '').trim();
    const v = matchVol(row, byNum, byCed);
    const payload = {
      medio_transporte: mapTransporte(row['Medio de transporte']),
      asistencia_zona: mapZona(row.Asistencia),
      observaciones_logistica: String(row.Obeservaciones || row.Observaciones || '').trim() || null,
    };

    if (!v) {
      notRegistered.push({
        num: Number(row['N° Voluntaria']) || null,
        nombre: excelNombre,
        cedula: row.Cedula,
        transporte: row['Medio de transporte'],
        zona: row.Asistencia,
      });
      continue;
    }

    registered.push({
      num: v.numero_voluntaria,
      nombre: `${v.nombre} ${v.apellido}`.trim(),
      excelNombre,
      ...payload,
      antes: {
        medio_transporte: v.medio_transporte,
        asistencia_zona: v.asistencia_zona,
        observaciones_logistica: v.observaciones_logistica,
      },
      id: v.id,
    });

    updates.push({ id: v.id, ...payload });
  }

  console.log(`Excel: ${XLSX_PATH} (${sheetName}, ${rows.length} filas)`);
  console.log(`Grupo: ${GRUPO}\n`);

  console.log(`=== Registradas (${registered.length}) ===`);
  for (const r of registered) {
    const veh = r.medio_transporte === 'sin_transporte' ? 'sin vehículo' : r.medio_transporte;
    console.log(`  #${r.num} ${r.nombre} → ${veh}, zona: ${r.asistencia_zona || '—'}`);
    if (r.observaciones_logistica) console.log(`      obs: ${r.observaciones_logistica}`);
  }

  console.log(`\n=== No registradas (${notRegistered.length}) ===`);
  if (!notRegistered.length) {
    console.log('  (ninguna)');
  } else {
    for (const r of notRegistered) {
      console.log(`  ${r.nombre} (ced: ${r.cedula}) — ${r.transporte || 'sin dato'} — ${r.zona}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] Sin cambios en BD.');
    return;
  }

  let ok = 0;
  for (const u of updates) {
    const { error: eUp } = await db.from('voluntarios').update({
      medio_transporte: u.medio_transporte,
      asistencia_zona: u.asistencia_zona,
      observaciones_logistica: u.observaciones_logistica,
    }).eq('id', u.id);
    if (eUp) {
      console.error(`Error #${registered.find((r) => r.id === u.id)?.num}:`, eUp.message);
      continue;
    }
    ok++;
  }
  console.log(`\n✓ ${ok}/${updates.length} fichas actualizadas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
