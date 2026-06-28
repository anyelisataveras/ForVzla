#!/usr/bin/env node
/**
 * Importa edificios verificados de terremotovenezuela.com
 * (solo daño total o severo) → edificios_colapsados.
 *
 *   npm run ingesta:tv          # escribe en Supabase
 *   npm run ingesta:tv:dry      # vista previa sin escribir
 */

import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './lib/config.js';
import { loadEnvFiles, missingEnvKeys } from './lib/loadEnv.js';
import { geocode } from './lib/geocode.js';
import {
  fetchBuildings,
  hasTvId,
  mapDamageLevel,
  tvIdMarker,
} from './lib/terremotovenezuela.js';
import { findDuplicate } from './lib/edificiosDedup.js';

function zonaFrom(b) {
  return b.zone || b.city || 'Venezuela';
}

function buildNotas(b, estado) {
  const parts = [
    tvIdMarker(b.id),
    `[terremotovenezuela.com] ${estado === 'colapsado' ? 'colapso total' : 'daño severo'}`,
  ];
  if (b.notes) parts.push(b.notes.trim());
  if (b.trapped_names) parts.push(`Posibles atrapados: ${b.trapped_names.trim()}`);
  if (b.main_photo_url) parts.push(`Foto: ${b.main_photo_url}`);
  if (b.general_source) parts.push(`Fuente reporte: ${b.general_source}`);
  return parts.join(' · ');
}

function hasCoords(b) {
  return Number.isFinite(b.lat) && Number.isFinite(b.lng);
}

async function resolveCoords(b) {
  if (hasCoords(b)) return { lat: b.lat, lng: b.lng, approx: false };
  const q = [b.address, b.zone, b.city].filter(Boolean).join(', ');
  if (!q) return null;
  const geo = await geocode(q);
  if (!geo) return null;
  return { ...geo, approx: true };
}

function mergeNotas(existing, incoming) {
  const base = (existing || '').trim();
  if (!base) return incoming;
  if (base.includes(incoming.split(' · ')[0])) return base;
  return `${base} · ${incoming}`;
}

function patchRow(existing, candidate, notas) {
  const patch = { notas: mergeNotas(existing.notas, notas) };
  if (candidate.personas_atrapadas && !existing.personas_atrapadas) {
    patch.personas_atrapadas = true;
  }
  if (candidate.approxCoords && hasCoords({ lat: existing.lat, lng: existing.lng })) {
    // no pisar coordenadas ya verificadas
  } else if (hasCoords(candidate)) {
    patch.lat = candidate.lat;
    patch.lng = candidate.lng;
  }
  if (!existing.sector && candidate.sector) patch.sector = candidate.sector;
  if (existing.estado_edificio === 'danos_graves' && candidate.estado_edificio === 'colapsado') {
    patch.estado_edificio = 'colapsado';
  }
  return patch;
}

async function main() {
  loadEnvFiles();
  const cfg = loadConfig();
  const dryRun = cfg.dryRun;

  if (!dryRun) {
    const missing = missingEnvKeys(['SUPABASE_KEY']);
    if (missing.length) {
      console.error('❌ Faltan en ForVzla/.env:', missing.join(', '));
      process.exit(1);
    }
  }

  console.log(`\n🏚 Ingesta terremotovenezuela.com (${dryRun ? 'DRY RUN' : 'LIVE'})`);
  console.log('   Filtro: verificado + total/severo\n');

  const remote = await fetchBuildings();
  console.log(`  Fuente: ${remote.length} edificios`);

  const db = dryRun ? null : createClient(cfg.sbUrl, cfg.sbKey);
  const { data: existing, error: loadErr } = dryRun
    ? { data: [], error: null }
    : await db.from('edificios_colapsados').select('*');
  if (loadErr) throw new Error(loadErr.message);

  const stats = { insert: 0, update: 0, skip: 0, no_coords: 0, error: 0 };

  for (const b of remote) {
    const estado = mapDamageLevel(b.damage_level);
    if (!estado) {
      stats.skip++;
      continue;
    }

    if (!dryRun && existing.some(e => hasTvId(e.notas, b.id))) {
      stats.skip++;
      continue;
    }

    const coords = await resolveCoords(b);
    if (!coords) {
      console.warn(`  ⚠ sin coords: ${b.name} (${b.city || '?'})`);
      stats.no_coords++;
      continue;
    }

    const candidate = {
      tvId: b.id,
      nombre: b.name,
      zona: zonaFrom(b),
      sector: b.zone || null,
      lat: coords.lat,
      lng: coords.lng,
      approxCoords: coords.approx,
      estado_edificio: estado,
      personas_atrapadas: !!(b.trapped_names?.trim() || b.has_missing_persons),
      fuente: 'terremotovenezuela.com',
      notas: buildNotas(b, estado),
    };

    const dup = findDuplicate(existing, candidate, { radioM: cfg.radioDupM });
    if (dup) {
      const patch = patchRow(dup.match, candidate, candidate.notas);
      if (dryRun) {
        console.log(`  ↻ UPDATE (${dup.reason}) ${dup.match.nombre} ← ${candidate.nombre}`);
        stats.update++;
        continue;
      }
      const { error } = await db.from('edificios_colapsados').update(patch).eq('id', dup.match.id);
      if (error) {
        console.warn(`  ✗ update ${candidate.nombre}:`, error.message);
        stats.error++;
      } else {
        Object.assign(dup.match, patch);
        console.log(`  ↻ ${dup.match.nombre} (${dup.reason})`);
        stats.update++;
      }
      continue;
    }

    if (dryRun) {
      const tag = coords.approx ? 'aprox' : 'gps';
      console.log(`  + INSERT [${estado}] ${candidate.nombre} (${candidate.zona}) ${tag} ${candidate.lat},${candidate.lng}`);
      stats.insert++;
      continue;
    }

    const { data: inserted, error } = await db
      .from('edificios_colapsados')
      .insert({
        nombre: candidate.nombre,
        zona: candidate.zona,
        sector: candidate.sector,
        lat: candidate.lat,
        lng: candidate.lng,
        estado_edificio: candidate.estado_edificio,
        personas_atrapadas: candidate.personas_atrapadas,
        fuente: candidate.fuente,
        notas: candidate.notas,
      })
      .select()
      .single();

    if (error) {
      console.warn(`  ✗ insert ${candidate.nombre}:`, error.message);
      stats.error++;
    } else {
      existing.push(inserted);
      console.log(`  + ${candidate.nombre}`);
      stats.insert++;
    }
  }

  console.log('\nResumen:', stats, '\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
