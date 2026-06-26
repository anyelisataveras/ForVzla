/** Carga .env desde raíz del repo o carpeta scraper (sin dependencia extra). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_ALIASES = {
  SUPABASE_KEY: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SERVICE_ROLE_KEY'],
  APIFY_TOKEN: ['APIFY_API_TOKEN'],
};

export function loadEnvFiles() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [resolve(here, '../../.env'), resolve(here, '../.env')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      const key = t.slice(0, i).trim();
      const val = t.slice(i + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
  for (const [canonical, aliases] of Object.entries(ENV_ALIASES)) {
    if (process.env[canonical]) continue;
    for (const alt of aliases) {
      if (process.env[alt]) {
        process.env[canonical] = process.env[alt];
        break;
      }
    }
  }
}

export function missingEnvKeys(required) {
  return required.filter(k => !(process.env[k] || '').trim());
}

