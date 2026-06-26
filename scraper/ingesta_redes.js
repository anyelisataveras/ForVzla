#!/usr/bin/env node
/**
 * ingesta_redes.js — Ayuda Venezuela
 * ---------------------------------------------------------------
 * Convierte posts públicos de redes sociales en filas de `necesidades`,
 * EVITANDO DUPLICADOS.
 *
 * Plataformas: Instagram, TikTok, Twitter/X, Telegram (Bot API).
 *
 * Flujo:
 *   1) Apify / Telegram scrapean por hashtags/keywords (data pública).
 *   2) Claude (Haiku) clasifica: categoría amplia + campos del schema.
 *   3) Guarda en posts_redes (crudo + clasificación AI).
 *   4) Pendientes los revisa un coordinador en la app → aprobar_post_redes.
 *   5) Al aprobar se crea necesidad validada (con dedup geo).
 *
 * Ejecutar:  node ingesta_redes.js
 * Requiere Node 18+ (fetch nativo).
 * ---------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './lib/config.js';
import { loadEnvFiles, missingEnvKeys } from './lib/loadEnv.js';
import { hashPost, procesar } from './lib/ingest.js';
import { scrapeInstagram } from './lib/scrapers/instagram.js';
import { scrapeTikTok } from './lib/scrapers/tiktok.js';
import { scrapeTwitter } from './lib/scrapers/twitter.js';
import { scrapeTelegram } from './lib/scrapers/telegram.js';

const SCRAPERS = {
  instagram: scrapeInstagram,
  tiktok: scrapeTikTok,
  twitter: scrapeTwitter,
  telegram: scrapeTelegram,
};

async function scrapeAll(cfg) {
  const needsApify = cfg.platforms.some(p => ['instagram', 'tiktok', 'twitter'].includes(p));
  if (needsApify && !cfg.apifyToken) {
    throw new Error('Falta APIFY_TOKEN (requerido para instagram/tiktok/twitter)');
  }

  const tasks = cfg.platforms
    .filter(p => SCRAPERS[p])
    .map(async (p) => {
      try {
        const posts = await SCRAPERS[p](cfg);
        console.log(`  ✓ ${p}: ${posts.length} posts`);
        return posts;
      } catch (e) {
        console.warn(`  ⚠ ${p}:`, e.message);
        return [];
      }
    });

  const batches = await Promise.all(tasks);
  return batches.flat();
}

async function main() {
  loadEnvFiles();
  const cfg = loadConfig();

  const need = ['ANTHROPIC_API_KEY'];
  if (!cfg.dryRun) need.push('SUPABASE_KEY');
  const missing = missingEnvKeys(need);
  if (missing.length) {
    console.error('❌ Faltan en ForVzla/.env (no en .env.example):');
    for (const k of missing) console.error(`   ${k}=`);
    process.exit(1);
  }

  if (!cfg.apifyToken && cfg.platforms.some(p => ['instagram', 'tiktok', 'twitter'].includes(p))) {
    throw new Error('Falta APIFY_TOKEN');
  }
  if (!cfg.dryRun && !cfg.sbKey) throw new Error('Falta SUPABASE_KEY (service_role)');

  const db = cfg.sbKey ? createClient(cfg.sbUrl, cfg.sbKey) : null;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Ayuda Venezuela — ingesta redes`);
  console.log(`  Plataformas: ${cfg.platforms.join(', ')}`);
  console.log(`  Keywords: ${cfg.keywords.length} términos`);
  console.log(`${'═'.repeat(50)}\n`);

  const posts = await scrapeAll(cfg);

  const vistos = new Set();
  const unicos = posts.filter(p => {
    if (!p.post_id) return false;
    const k = hashPost(p.plataforma, p.post_id);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  console.log(`\n📥 ${unicos.length} posts únicos recolectados`);

  const tally = {};
  const ctx = { db, anthropicKey: cfg.anthropicKey, dryRun: cfg.dryRun };

  for (const p of unicos) {
    try {
      const r = await procesar(p, ctx);
      tally[r.estado] = (tally[r.estado] || 0) + 1;
    } catch (e) {
      console.warn('proc', e.message);
      tally.error = (tally.error || 0) + 1;
    }
  }

  console.log('\n📊 Resumen:', tally);
  console.log('Pendientes en posts_redes → moderar en la app (tab Moderar) o Supabase Table Editor.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
