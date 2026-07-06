#!/usr/bin/env node
/** Migración manual: comentario IG @brianda0713 — OPP 26 Torre B piso 9 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { loadEnvFiles, missingEnvKeys } from '../scraper/lib/loadEnv.js';

loadEnvFiles();
const missing = missingEnvKeys(['SUPABASE_KEY']);
if (missing.length) {
  console.error('❌ Faltan en ForVzla/.env:', missing.join(', '));
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const texto =
  'AYUJA URGENTE PARA UNA MAMA CON 2 NINAS, UNA DE 9 MESES, ELLA ESTA AMAMANTANDO, ESTAN VIVAS! NECESSITAM AYUDA!!! LOS COCOS OPP26 TORRE B PISO 9 0414 9288048 y 04249702978 SU ABUELA';
const post_id = 'brianda0713_opp26_torreb_p9';
const source_hash = crypto.createHash('sha256').update(`instagram:${post_id}`).digest('hex').slice(0, 32);

const fila = {
  plataforma: 'instagram',
  post_id,
  url: null,
  texto,
  usuario: 'brianda0713',
  ubicacion_post: 'Los Cocos, La Guaira',
  source_hash,
  categoria: 'rescate',
  tipo: 'Rescate',
  urgencia: 'critica',
  zona: 'La Guaira',
  direccion: 'OPP 26 Torre B, Piso 9, Los Cocos (Urbanización Caribe)',
  descripcion:
    'Mamá con 2 niñas (una de 9 meses, amamantando). ESTÁN VIVAS. Necesitan rescate urgente. Tel. abuela: 0424-9702978',
  cantidad: '3 personas (mamá + 2 niñas)',
  telefono: '04149288048',
  confianza: 0.95,
  lat: 10.6182,
  lng: -66.8368,
  estado: 'pendiente',
};

let post;
const { data: existing } = await db.from('posts_redes').select('*').eq('source_hash', source_hash).limit(1);
if (existing?.length) {
  post = existing[0];
  console.log('ℹ️  Post ya en cola:', post.id, post.estado);
} else {
  const { data, error } = await db.from('posts_redes').insert(fila).select('*').single();
  if (error) {
    console.error('❌ posts_redes:', error.message);
    process.exit(1);
  }
  post = data;
  console.log('✅ Insertado en posts_redes:', post.id);
}

if (post.estado === 'aprobado' && post.necesidad_id) {
  console.log('ℹ️  Ya publicado, necesidad_id:', post.necesidad_id);
  process.exit(0);
}

const { data: cercanas } = await db.rpc('necesidades_cercanas', {
  p_lat: post.lat,
  p_lng: post.lng,
  p_radio_m: 200,
  p_tipo: 'Rescate',
});
if (cercanas?.length) {
  const dup = cercanas[0];
  await db.rpc('confirmar_necesidad', { p_id: dup.id });
  await db.from('posts_redes').update({ estado: 'aprobado', necesidad_id: dup.id, revisado_at: new Date().toISOString() }).eq('id', post.id);
  console.log('ℹ️  Duplicado cercano — confirmada existente:', dup.id);
  process.exit(0);
}

const nec = {
  zona: post.zona,
  direccion_exacta: post.direccion,
  lat: post.lat,
  lng: post.lng,
  tipo: 'Rescate',
  tipos: ['Rescate'],
  urgencia: post.urgencia,
  descripcion: post.descripcion,
  cantidad: post.cantidad,
  personas_afectadas: 3,
  nombre_contacto: '@brianda0713',
  telefono: post.telefono,
  whatsapp: '04249702978',
  fuente: 'instagram',
  source_hash: post.source_hash,
  validada: true,
  estado: 'pendiente',
  rescate_estado: 'nuevo',
};

const { data: inserted, error: insErr } = await db.from('necesidades').insert(nec).select('id').single();
if (insErr) {
  console.error('❌ necesidades:', insErr.message);
  process.exit(1);
}

await db.from('posts_redes').update({
  estado: 'aprobado',
  necesidad_id: inserted.id,
  revisado_at: new Date().toISOString(),
}).eq('id', post.id);

console.log('✅ Publicado en mapa — necesidad_id:', inserted.id);
