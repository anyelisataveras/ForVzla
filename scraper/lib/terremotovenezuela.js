/** Cliente read-only para terremotovenezuela.com (Supabase público). */

const TV_URL = 'https://jckifxsdlnsvbztxydes.supabase.co';
const TV_KEY = 'sb_publishable_i7iEDrCVZcSt0k3RGFrY4g_WrtZBB4w';

const HDRS = {
  apikey: TV_KEY,
  Authorization: `Bearer ${TV_KEY}`,
};

/** @returns {Promise<object[]>} */
export async function fetchBuildings({ damageLevels = ['total', 'severo'], status = 'verificado' } = {}) {
  const levels = damageLevels.map(d => encodeURIComponent(d)).join(',');
  const url = `${TV_URL}/rest/v1/buildings?select=*&status=eq.${encodeURIComponent(status)}&damage_level=in.(${levels})&order=last_updated_at.desc`;
  const r = await fetch(url, { headers: HDRS });
  if (!r.ok) throw new Error(`terremotovenezuela API ${r.status}: ${await r.text()}`);
  return r.json();
}

export function mapDamageLevel(level) {
  if (level === 'total') return 'colapsado';
  if (level === 'severo') return 'danos_graves';
  return null;
}

export function tvIdMarker(id) {
  return `__tv_id:${id}__`;
}

export function hasTvId(notas, id) {
  return (notas || '').includes(tvIdMarker(id));
}
