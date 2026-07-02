import { runApifyActor } from '../apify.js';
import { keywordsToHashtags } from '../config.js';

export async function scrapeInstagram({ apifyToken, hashtags, keywords, maxInstagram }) {
  console.log('📸 Instagram...');
  const searchTags = [...new Set([...hashtags, ...keywordsToHashtags(keywords)])];
  // instagram-search-scraper (searchType:hashtag) quedó roto → "Empty or private data".
  // instagram-hashtag-scraper sí devuelve posts por hashtag.
  const items = await runApifyActor(apifyToken, 'apify~instagram-hashtag-scraper', {
    hashtags: searchTags,
    resultsLimit: maxInstagram,
  });
  return items
    .filter(it => !it.error && !it.errorDescription)
    .map(it => ({
    plataforma: 'instagram',
    post_id: it.id || it.shortCode || it.url,
    url: it.url || (it.shortCode ? `https://instagram.com/p/${it.shortCode}` : null),
    texto: it.caption || it.text || '',
    usuario: it.ownerUsername || it.ownerFullName || '',
    ubicacion_post: it.locationName || null,
    ts: it.timestamp || null,
  }));
}
