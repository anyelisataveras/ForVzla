#!/usr/bin/env node
/**
 * Servidor HTTP mínimo para disparar el scraper desde el admin.
 * Verifica JWT de Supabase + tabla admin_users.
 *
 *   npm run server          (puerto 3456)
 *   POST /run  Authorization: Bearer <access_token>
 *   GET  /status
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFiles } from './lib/loadEnv.js';

loadEnvFiles();

const __dir = dirname(fileURLToPath(import.meta.url));
// Railway inyecta PORT; en local usa SCRAPER_PORT o 3456.
const PORT = +(process.env.PORT || process.env.SCRAPER_PORT || 3456);
const SB_URL = process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SB_SERVICE = process.env.SUPABASE_KEY;

let running = false;
let lastLog = '';
let lastExit = null;
let startedAt = null;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function json(res, obj, code = 200) {
  cors(res);
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

async function verifyAdmin(authHeader) {
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token || !SB_ANON || !SB_SERVICE) return null;

  const pub = createClient(SB_URL, SB_ANON);
  const { data: { user }, error } = await pub.auth.getUser(token);
  if (error || !user?.email) return null;

  const svc = createClient(SB_URL, SB_SERVICE);
  const { data } = await svc.from('admin_users')
    .select('email')
    .ilike('email', user.email)
    .maybeSingle();
  return data ? user : null;
}

function runScraper() {
  if (running) return false;
  running = true;
  lastLog = '';
  lastExit = null;
  startedAt = new Date().toISOString();

  const child = spawn('node', ['ingesta_redes.js'], {
    cwd: __dir,
    env: process.env,
  });
  const append = (d) => { lastLog += d.toString(); if (lastLog.length > 50000) lastLog = lastLog.slice(-40000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('close', (code) => {
    running = false;
    lastExit = code;
    lastLog += `\n--- fin (exit ${code}) ---\n`;
  });
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.end(); return; }

  if (req.url === '/health') {
    res.end('ok');
    return;
  }

  if (req.url === '/status' && req.method === 'GET') {
    json(res, { running, lastExit, startedAt, log: lastLog.slice(-8000) });
    return;
  }

  if (req.url === '/run' && req.method === 'POST') {
    const user = await verifyAdmin(req.headers.authorization);
    if (!user) { json(res, { ok: false, msg: 'No autorizado' }, 403); return; }
    if (!runScraper()) { json(res, { ok: false, msg: 'El scraper ya está corriendo' }); return; }
    json(res, { ok: true, msg: `Scraper iniciado por ${user.email}` });
    return;
  }

  if (req.url === '/voluntarios/registrar' && req.method === 'POST') {
    if (!SB_SERVICE) { json(res, { ok: false, msg: 'Servidor sin SUPABASE_KEY' }, 503); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch { json(res, { ok: false, msg: 'JSON inválido' }, 400); return; }
    const grupo = (payload.grupo || '').trim();
    const idDni = (payload.id_dni || '').trim();
    if (!grupo || !idDni || !(payload.nombre || '').trim() || !(payload.apellido || '').trim() || !(payload.telefono || '').trim()) {
      json(res, { ok: false, msg: 'Faltan campos obligatorios' }, 400);
      return;
    }
    const svc = createClient(SB_URL, SB_SERVICE);
    const { data: dup } = await svc.from('voluntarios').select('id').eq('grupo', grupo).eq('id_dni', idDni).maybeSingle();
    if (dup) { json(res, { ok: false, msg: 'Esta cédula ya está registrada en este grupo' }, 409); return; }
    const row = {
      grupo,
      nombre: String(payload.nombre).trim(),
      apellido: String(payload.apellido).trim(),
      edad: payload.edad ?? null,
      estado_civil: payload.estado_civil || null,
      id_dni: idDni,
      telefono: String(payload.telefono).trim(),
      pais: payload.pais || null,
      estado_provincia: payload.estado_provincia || null,
      ciudad: payload.ciudad || null,
      direccion: payload.direccion || null,
      red_social_plataforma: payload.red_social_plataforma || null,
      red_social_usuario: payload.red_social_usuario || null,
      profesion: payload.profesion || null,
      oficio: payload.oficio || null,
      disponibilidad: payload.disponibilidad || null,
      tiene_hijos: payload.tiene_hijos || null,
      hijos: Array.isArray(payload.hijos) ? payload.hijos : [],
      tareas: payload.tareas || null,
      fortalezas: payload.fortalezas || null,
      declaracion_jurada: true,
      asistencia_zona: payload.asistencia_zona || null,
      medio_transporte: payload.medio_transporte || null,
      observaciones_logistica: payload.observaciones_logistica || null,
      brigadas: Array.isArray(payload.brigadas) ? payload.brigadas : [],
    };
    const { data, error } = await svc.from('voluntarios').insert(row).select('numero_voluntaria, id').single();
    if (error) {
      json(res, { ok: false, msg: error.message || 'Error al registrar' }, 400);
      return;
    }
    json(res, { ok: true, numero_voluntaria: data.numero_voluntaria, id: data.id });
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Scraper server :${PORT}  POST /run  POST /voluntarios/registrar  GET /status  GET /health`);
  if (!SB_ANON) console.warn('⚠ Falta SUPABASE_ANON_KEY (o SUPABASE_PUBLISHABLE_KEY) en .env');
});
