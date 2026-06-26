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

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Scraper server :${PORT}  POST /run  GET /status`);
  if (!SB_ANON) console.warn('⚠ Falta SUPABASE_ANON_KEY (o SUPABASE_PUBLISHABLE_KEY) en .env');
});
