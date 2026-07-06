/** Sesión voluntaria: memoria + window.name (misma pestaña, sin localStorage). */
(function (global) {
  const GRUPO = window.CC_GRUPO_SLUG || 'cuidadoras_caracas';
  const SB_URL = 'https://ebsgvamzaegjgpjkpick.supabase.co';
  const SB_KEY = 'sb_publishable_vg8SSOkKpgvwOSyi2k-aVg_lslrQsBA';
  const SESS_PREFIX = 'CC_VOL:' + GRUPO + ':';
  const db = supabase.createClient(SB_URL, SB_KEY);

  let vol = null;
  let cred = null;

  function basePath() {
    const p = location.pathname.replace(/\/(entrar|mi-cuenta|jornadas|jornada)(\.html)?\/?$/, '');
    return p.endsWith('/') ? p : p + '/';
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
    const ret = returnPath || location.pathname + location.search;
    location.href = basePath() + 'entrar?return=' + encodeURIComponent(ret);
    return false;
  }

  function jornadaUrl(id) {
    return basePath() + 'jornada?id=' + encodeURIComponent(id);
  }

  restoreSession();

  global.CC_VOL = {
    GRUPO, SB_URL, SB_KEY, db, basePath, jornadaUrl,
    setSession, clearSession, getSession, credParams, autenticar, requireSession,
  };
})(window);
