#!/usr/bin/env node
/**
 * Aplica migraciones SQL de voluntarios en Supabase.
 * Requiere SUPABASE_DB_URL (Connection string → URI, modo Session)
 * en ForVzla/.env — Supabase Dashboard → Settings → Database
 *
 *   node scripts/apply_voluntarios_sql.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const FILES = [
  '20250705230000_voluntarios_grupos.sql',
  '20250705230100_voluntarios_seq_fix.sql',
  '20250705230200_registrar_voluntario_rpc.sql',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const missing = missingEnvKeys(['SUPABASE_DB_URL']);
if (missing.length) {
  const alt = (process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '').trim();
  if (alt) process.env.SUPABASE_DB_URL = alt;
}
const missingFinal = missingEnvKeys(['SUPABASE_DB_URL']);
if (missingFinal.length) {
  console.error('Falta SUPABASE_DB_URL en .env (connection string de Supabase → Database → URI)');
  console.error('Pega manualmente en SQL Editor el contenido de:');
  FILES.forEach(f => console.error('  supabase/migrations/' + f));
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  for (const f of FILES) {
    const path = resolve(root, 'supabase/migrations', f);
    if (!existsSync(path)) { console.warn('Skip', f); continue; }
    const sql = readFileSync(path, 'utf8');
    console.log('Applying', f, '...');
    await client.query(sql);
    console.log('  OK');
  }
  await client.query(`select setval(pg_get_serial_sequence('voluntarios', 'numero_voluntaria'), coalesce((select max(numero_voluntaria) from voluntarios), 1))`);
  console.log('Secuencia sincronizada.');
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
