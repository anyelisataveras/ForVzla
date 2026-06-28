const TV_ID_RE = /__tv_id:([0-9a-f-]{36})__/i;

export function extractTvId(notas) {
  const m = (notas || '').match(TV_ID_RE);
  return m ? m[1] : null;
}

export function normName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(residencias?|res\.?|edificio|edf\.?|hotel|torre|conjunto)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function namesMatch(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const ta = new Set(na.split(' ').filter(w => w.length > 2));
  const tb = new Set(nb.split(' ').filter(w => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 && inter / union >= 0.6;
}

export function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** @param {object[]} existing */
export function findDuplicate(existing, candidate, { radioM = 200 } = {}) {
  const byTv = existing.find(e => extractTvId(e.notas) === candidate.tvId);
  if (byTv) return { match: byTv, reason: 'tv_id' };

  const byName = existing.find(e => namesMatch(e.nombre, candidate.nombre));
  if (byName) return { match: byName, reason: 'nombre' };

  if (candidate.lat != null && candidate.lng != null) {
    const byGeo = existing.find(e => {
      if (e.lat == null || e.lng == null) return false;
      if (e.estado_edificio !== candidate.estado_edificio) return false;
      return distM(e.lat, e.lng, candidate.lat, candidate.lng) < radioM;
    });
    if (byGeo) return { match: byGeo, reason: 'geo' };
  }

  return null;
}
