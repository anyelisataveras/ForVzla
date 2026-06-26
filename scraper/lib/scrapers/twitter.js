import { runApifyActor } from '../apify.js';

/** Scraper X/Twitter — actor apidojo/tweet-scraper (portado desde Python). */
export async function scrapeTwitter({ apifyToken, keywords, maxTwitter }) {
  console.log('🐦 Twitter/X...');
  const items = await runApifyActor(apifyToken, 'apidojo~tweet-scraper', {
    searchTerms: keywords,
    maxItems: maxTwitter,
    lang: 'es',
    twitterContent: 'Latest',
  });
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
      ts: it.created_at || null,
      _meta: {
        verificado: author.isVerified || false,
        likes: metrics.like_count || it.favorite_count || 0,
        retweets: metrics.retweet_count || it.retweet_count || 0,
      },
    };
  });
}
