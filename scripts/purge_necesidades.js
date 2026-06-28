#!/usr/bin/env node
/**
 * Borra TODAS las filas de necesidades (y limpia FKs en posts_redes).
 * Requiere SUPABASE_KEY (service_role) en ForVzla/.env
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();

const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('❌ Faltan en ForVzla/.env:', missing.join(', '));
  process.exit(1);
}

const db = createClient(SB_URL, SB_KEY);

async function main() {
  const { count: before } = await db.from('necesidades').select('*', { count: 'exact', head: true });
  console.log(`🗑️  Necesidades antes: ${before ?? 0}`);

  const { error: e1 } = await db.from('posts_redes').update({ necesidad_id: null }).not('necesidad_id', 'is', null);
  if (e1) throw new Error(`posts_redes: ${e1.message}`);

  const { data: rows, error: e2 } = await db.from('necesidades').select('id');
  if (e2) throw new Error(`select: ${e2.message}`);
  const ids = (rows || []).map(r => r.id);
  if (!ids.length) {
    console.log('✅ No había necesidades que borrar.');
    return;
  }

  const { error: e3 } = await db.from('necesidades').update({ merged_into: null }).in('id', ids);
  if (e3) throw new Error(`merged_into: ${e3.message}`);

  const { error: e4 } = await db.from('necesidades').delete().in('id', ids);
  if (e4) throw new Error(`delete: ${e4.message}`);

  const { count: after } = await db.from('necesidades').select('*', { count: 'exact', head: true });
  console.log(`✅ Borradas ${ids.length}. Restantes: ${after ?? 0}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
