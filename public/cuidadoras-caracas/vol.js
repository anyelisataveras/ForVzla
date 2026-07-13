/** Sesión voluntaria: memoria + window.name (misma pestaña, sin localStorage). */
(function (global) {
  const GRUPO = window.CC_GRUPO_SLUG || 'cuidadoras_caracas';
  const SB_URL = 'https://ebsgvamzaegjgpjkpick.supabase.co';
  const SB_KEY = 'sb_publishable_vg8SSOkKpgvwOSyi2k-aVg_lslrQsBA';
  const SESS_PREFIX = 'CC_VOL:' + GRUPO + ':';
  /** Sin persistSession: evita 401 si hay JWT viejo de coord/admin en localStorage. */
  const VOL_AUTH = {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  };
  /** PostgREST: JWT inválido en Authorization → 401. Usar fetch nativo (supabase-js parchea fetch). */
  const nativeFetch = global.__nativeFetch || global.fetch.bind(global);
  function volFetch(input, init) {
    const headers = new Headers(init?.headers || {});
    headers.set('apikey', SB_KEY);
    headers.set('Authorization', 'Bearer ' + SB_KEY);
    return nativeFetch(input, { ...init, headers });
  }
  const db = supabase.createClient(SB_URL, SB_KEY, {
    auth: VOL_AUTH,
    global: { fetch: volFetch },
    accessToken: async () => SB_KEY,
  });

  function apiHeaders(contentType) {
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }

  /** RPC vía fetch directo — evita 401 por JWT stale en supabase-js. */
  async function rpc(name, params) {
    const res = await volFetch(SB_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: apiHeaders('application/json'),
      body: JSON.stringify(params),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_e) {}
    if (!res.ok) {
      const err = new Error(data?.message || data?.error || text || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function storageUpload(bucket, path, blob, contentType) {
    const url = SB_URL + '/storage/v1/object/' + bucket + '/' + path;
    const res = await volFetch(url, {
      method: 'POST',
      headers: Object.assign(apiHeaders(contentType), { 'x-upsert': 'false' }),
      body: blob,
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const j = await res.json();
        msg = j.message || j.error || msg;
      } catch (_e) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    try { return await res.json(); } catch (_e) { return {}; }
  }

  async function storageRemove(bucket, paths) {
    const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    if (!list.length) return;
    const res = await volFetch(SB_URL + '/storage/v1/object/' + bucket, {
      method: 'DELETE',
      headers: apiHeaders('application/json'),
      body: JSON.stringify({ prefixes: list }),
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const j = await res.json();
        msg = j.message || j.error || msg;
      } catch (_e) {}
      throw new Error(msg);
    }
  }

  function normalizeSignedUrl(signed) {
    if (!signed) return signed;
    if (signed.startsWith('http://') || signed.startsWith('https://')) return signed;
    if (signed.startsWith('/storage/v1/')) return SB_URL + signed;
    if (signed.startsWith('/object/')) return SB_URL + '/storage/v1' + signed;
    return SB_URL + '/storage/v1/' + String(signed).replace(/^\//, '');
  }

  async function storageSignUrl(bucket, path, expiresIn) {
    const url = SB_URL + '/storage/v1/object/sign/' + bucket + '/' + path;
    const res = await volFetch(url, {
      method: 'POST',
      headers: apiHeaders('application/json'),
      body: JSON.stringify({ expiresIn: expiresIn || 300 }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_e) {}
    if (!res.ok) throw new Error(data?.message || data?.error || text || ('HTTP ' + res.status));
    return normalizeSignedUrl(data.signedURL || data.signedUrl);
  }

  function storageAuthenticatedUrl(bucket, path) {
    const encoded = String(path).split('/').map(encodeURIComponent).join('/');
    return SB_URL + '/storage/v1/object/authenticated/' + bucket + '/' + encoded;
  }

  /** Descarga objeto vía RLS (authenticated) o signed URL → blob: local. */
  async function storageFetchBlob(bucket, path, expiresIn) {
    const authUrl = storageAuthenticatedUrl(bucket, path);
    let res = await volFetch(authUrl);
    if (!res.ok) {
      const signed = await storageSignUrl(bucket, path, expiresIn || 300);
      res = await nativeFetch(signed);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch (_e) {}
      throw new Error('No se pudo cargar el archivo (' + res.status + ')' + (detail ? ': ' + detail.slice(0, 120) : ''));
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('Archivo vacío');
    return URL.createObjectURL(blob);
  }

  async function functionsInvoke(name, body) {
    const res = await volFetch(SB_URL + '/functions/v1/' + name, {
      method: 'POST',
      headers: apiHeaders('application/json'),
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_e) {}
    if (!res.ok) throw new Error(data?.error || data?.message || text || ('HTTP ' + res.status));
    return data;
  }

  let vol = null;
  let cred = null;

  function basePath() {
    let p = location.pathname
      .replace(/\/index\.html\/?$/, '/')
      .replace(/\/(entrar|mi-cuenta|jornadas|jornada|carnet|registro|coord)(\.html)?\/?$/, '');
    if (!p.endsWith('/')) p += '/';
    return p;
  }

  function normalizeReturnPath(path) {
    if (!path) return 'mi-cuenta';
    if (path.startsWith('http')) return path;
    const q = path.includes('?') ? path.slice(path.indexOf('?')) : '';
    const bare = path.split('?')[0].replace(/^\//, '');
    const m = bare.match(/^(?:cuidadoras-caracas\/)?(entrar|mi-cuenta|jornadas|jornada|carnet|registro)(?:\.html)?\/?$/);
    if (m) return m[1] + q;
    if (bare.startsWith('cuidadoras-caracas/')) return bare.slice('cuidadoras-caracas/'.length) + q;
    if (path.startsWith('/')) return path;
    return path.replace(/^\//, '');
  }

  function encodeSession(payload) {
    return SESS_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function decodeSession(raw) {
    if (!raw || !raw.startsWith(SESS_PREFIX)) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(raw.slice(SESS_PREFIX.length)))));
    } catch (e) {
      return null;
    }
  }

  function persistSession() {
    if (!vol || !cred) {
      if (window.name && window.name.startsWith(SESS_PREFIX)) window.name = '';
      return;
    }
    try {
      window.name = encodeSession({ vol, cred });
    } catch (e) {}
  }

  function restoreSession() {
    if (vol && cred) return;
    const parsed = decodeSession(window.name);
    if (parsed?.vol?.id && parsed?.cred?.plataforma && parsed?.cred?.usuario && parsed?.cred?.cedula4) {
      vol = parsed.vol;
      cred = parsed.cred;
    }
  }

  function setSession(voluntario, credentials) {
    vol = voluntario;
    cred = credentials;
    persistSession();
  }

  function clearSession() {
    vol = null;
    cred = null;
    persistSession();
  }

  function getSession() {
    restoreSession();
    return vol ? { ...vol, cred: { ...cred } } : null;
  }

  function credParams() {
    restoreSession();
    if (!vol || !cred) return null;
    return {
      p_voluntario_id: vol.id,
      p_grupo: GRUPO,
      p_plataforma: cred.plataforma,
      p_usuario: cred.usuario,
      p_cedula4: cred.cedula4,
    };
  }

  async function autenticar(plataforma, usuario, cedula4) {
    const { data, error } = await db.rpc('autenticar_voluntario', {
      p_grupo: GRUPO,
      p_plataforma: plataforma,
      p_usuario: usuario,
      p_cedula4: cedula4,
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error || 'No se pudo entrar' };
    setSession(data.voluntario, { plataforma, usuario, cedula4 });
    return { ok: true, voluntario: data.voluntario };
  }

  function requireSession(returnPath) {
    restoreSession();
    if (vol && cred) return true;
    const ret = normalizeReturnPath(returnPath || (location.pathname + location.search));
    location.href = basePath() + 'entrar?return=' + encodeURIComponent(ret);
    return false;
  }

  function jornadaUrl(id) {
    return basePath() + 'jornada?id=' + encodeURIComponent(id);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtJornadaDate(d) {
    if (!d) return '';
    const p = d.split('-');
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return parseInt(p[2], 10) + ' ' + mes[parseInt(p[1], 10) - 1];
  }

  function fmtJornadaTime(t) {
    return t ? t.slice(0, 5) : '';
  }

  function jornadaEstadoBadge(estado) {
    if (estado === 'abierta') return '<span class="badge open">Abierta</span>';
    if (estado === 'llena') return '<span class="badge full">Cupo lleno</span>';
    if (estado === 'realizada') return '<span class="badge done">Realizada</span>';
    return '';
  }

  function inscripcionBadge(estado) {
    if (estado === 'confirmada') return '<span class="badge me">Confirmada</span>';
    if (estado === 'no_puede') return '<span class="badge done">No puedo ir</span>';
    if (estado === 'asistio') return '<span class="badge me">Asististe</span>';
    if (estado === 'no_asistio') return '<span class="badge done">No asististe</span>';
    return '';
  }

  function filterJornadas(rows, tab) {
    const today = todayIso();
    const proximas = rows
      .filter((j) => j.fecha >= today && j.estado !== 'realizada')
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.hora_salida || '').localeCompare(b.hora_salida || ''));
    const pasadas = rows
      .filter((j) => j.fecha < today || j.estado === 'realizada')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.hora_salida || '').localeCompare(a.hora_salida || ''));
    if (tab === 'proximas') return proximas;
    if (tab === 'pasadas') return pasadas;
    return [...rows].sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.hora_salida || '').localeCompare(a.hora_salida || ''));
  }

  restoreSession();

  global.CC_VOL = {
    GRUPO, SB_URL, SB_KEY, db, rpc, storageUpload, storageRemove, storageSignUrl, storageFetchBlob, functionsInvoke,
    basePath, jornadaUrl, todayIso,
    fmtJornadaDate, fmtJornadaTime, jornadaEstadoBadge, inscripcionBadge, filterJornadas,
    setSession, clearSession, getSession, credParams, autenticar, requireSession, normalizeReturnPath,
  };
})(window);
