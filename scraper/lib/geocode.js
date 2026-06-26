const geoCache = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Geocoding best-effort con OSM Nominatim (1 req/s). */
export async function geocode(q) {
  if (!q) return null;
  if (geoCache.has(q)) return geoCache.get(q);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ', Venezuela')}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'AyudaVenezuela/1.0 (emergencia)' } });
    const j = await r.json();
    const out = j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
    geoCache.set(q, out);
    await sleep(1100);
    return out;
  } catch {
    return null;
  }
}
