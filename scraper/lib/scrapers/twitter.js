import { runApifyActor } from '../apify.js';

// El actor devuelve createdAt como "Fri Nov 24 17:49:36 +0000 2023",
// que Postgres timestamptz no acepta directo → normalizamos a ISO 8601.
function normalizarFecha(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Scraper X/Twitter — actor apidojo/tweet-scraper (portado desde Python). */
export async function scrapeTwitter({ apifyToken, keywords, maxTwitter, sinceDate }) {
  console.log('🐦 Twitter/X...');
  const input = {
    searchTerms: keywords,
    maxItems: maxTwitter,
    lang: 'es',
    twitterContent: 'Latest',
  };
  // Filtra en origen por fecha (YYYY-MM-DD) → menos ítems, menos coste/tokens.
  if (sinceDate) input.start = sinceDate;
  const items = await runApifyActor(apifyToken, 'apidojo~tweet-scraper', input);
  return items
    .filter(it => !it.noResults && !it.error)
    .map(it => {
    const author = it.author || {};
    const metrics = it.public_metrics || {};
    return {
      plataforma: 'twitter',
      post_id: it.id || it.id_str || it.url,
      url: it.url || it.permanentUrl || null,
      texto: it.full_text || it.text || '',
      usuario: author.userName || it.user?.screen_name || '',
      ubicacion_post: null,
      ts: normalizarFecha(it.createdAt || it.created_at),
      _meta: {
        verificado: author.isVerified || false,
        likes: metrics.like_count || it.favorite_count || 0,
        retweets: metrics.retweet_count || it.retweet_count || 0,
      },
    };
  });
}
