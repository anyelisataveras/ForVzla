#!/usr/bin/env node
/**
 * purge_seeds.js — Borra TODA la data semilla de Supabase.
 * Requiere SUPABASE_KEY (service_role) en .env
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles, missingEnvKeys } from './lib/loadEnv.js';

loadEnvFiles();

const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('❌ Faltan en ForVzla/.env (no en .env.example):');
  for (const k of missing) console.error(`   ${k}=   ← pega aquí la service_role key`);
  console.error('\n   Supabase → Project Settings → API → service_role (secret)');
  process.exit(1);
}

const db = createClient(SB_URL, SB_KEY);

async function deleteAll(table) {
  const { data, error: selErr } = await db.from(table).select('id');
  if (selErr) throw new Error(`${table} select: ${selErr.message}`);
  if (!data?.length) return 0;
  const ids = data.map(r => r.id);
  const { error } = await db.from(table).delete().in('id', ids);
  if (error) throw new Error(`${table} delete: ${error.message}`);
  return ids.length;
}

async function main() {
  console.log('🗑️  Borrando toda la data seed...\n');

  // Necesidades demo: marcadas __seed_v1__ o fuente coordinador (todo el seed actual)
  const { data: n1, error: e1 } = await db.from('necesidades')
    .delete()
    .eq('notas_coordinador', '__seed_v1__')
    .select('id');
  if (e1) throw new Error(e1.message);

  const { data: n2, error: e2 } = await db.from('necesidades')
    .delete()
    .eq('fuente', 'coordinador')
    .select('id');
  if (e2) throw new Error(e2.message);

  const edificios = await deleteAll('edificios_colapsados');
  const centros = await deleteAll('centros_acopio');

  console.log(`  necesidades (__seed_v1__):  ${n1?.length ?? 0}`);
  console.log(`  necesidades (coordinador): ${n2?.length ?? 0}`);
  console.log(`  edificios_colapsados:      ${edificios}`);
  console.log(`  centros_acopio:            ${centros}`);

  const { count: n } = await db.from('necesidades').select('*', { count: 'exact', head: true });
  console.log(`\n✅ Necesidades restantes (deberían ser solo ciudadanos reales): ${n ?? 0}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
