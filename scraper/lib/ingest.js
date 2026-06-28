import crypto from 'node:crypto';
import { clasificar, INGESTAR_CATEGORIAS } from './classifier.js';
import { geocode } from './geocode.js';
import { evaluarCandidato } from './quality.js';

export function hashPost(plataforma, post_id) {
  return crypto.createHash('sha256').update(`${plataforma}:${post_id}`).digest('hex').slice(0, 32);
}

async function yaExistePost(db, hash) {
  const { data } = await db.from('posts_redes').select('id').eq('source_hash', hash).limit(1);
  return data && data.length > 0;
}

/** Guarda post crudo + clasificación en posts_redes (cola de moderación). */
export async function procesar(post, { db, anthropicKey, dryRun }) {
  const hash = hashPost(post.plataforma, post.post_id);

  if (!dryRun && db && await yaExistePost(db, hash)) {
    return { estado: 'skip_hash' };
  }

  const c = await clasificar(post, anthropicKey);
  if (!c) return { estado: 'error_clasificacion' };

  let geo = post.ubicacion_post ? await geocode(post.ubicacion_post) : null;
  if (!geo && c.direccion) geo = await geocode(`${c.direccion} ${c.zona}`);
  if (!geo && c.zona) geo = await geocode(c.zona);

  const tipo = c.categoria === 'rescate' ? (c.tipo || 'Rescate') : (c.tipo || 'Otra');
  const { urgencia, estadoPost } = INGESTAR_CATEGORIAS.has(c.categoria)
    ? evaluarCandidato(c, post, geo)
    : { urgencia: c.urgencia || 'urgente', estadoPost: 'descartado' };

  const fila = {
    plataforma: post.plataforma,
    post_id: String(post.post_id),
    url: post.url,
    texto: (post.texto || '').slice(0, 4000),
    usuario: post.usuario || '',
    ubicacion_post: post.ubicacion_post,
    post_ts: post.ts || null,
    source_hash: hash,
    categoria: c.categoria,
    tipo,
    urgencia,
    zona: c.zona,
    direccion: c.direccion,
    descripcion: c.descripcion,
    cantidad: c.cantidad,
    telefono: c.telefono,
    confianza: c.confianza,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    estado: estadoPost,
  };

  if (dryRun) {
    console.log('DRY', fila.plataforma, fila.estado, fila.categoria, fila.zona, '-', (fila.descripcion || fila.texto).slice(0, 80));
    return { estado: 'dry', post_estado: estadoPost };
  }

  const { error } = await db.from('posts_redes').insert(fila);
  if (error) {
    console.warn('insert posts_redes', error.message);
    return { estado: 'error' };
  }
  return { estado: estadoPost };
}
