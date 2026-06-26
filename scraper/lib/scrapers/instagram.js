import { runApifyActor } from '../apify.js';
import { keywordsToHashtags } from '../config.js';

export async function scrapeInstagram({ apifyToken, hashtags, keywords, maxInstagram }) {
  console.log('📸 Instagram...');
  const searchTags = [...new Set([...hashtags, ...keywordsToHashtags(keywords)])];
  const items = await runApifyActor(apifyToken, 'apify~instagram-search-scraper', {
    search: searchTags.join(' '),
    searchType: 'hashtag',
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
