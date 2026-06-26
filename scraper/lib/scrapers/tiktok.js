import { runApifyActor } from '../apify.js';
import { keywordsToHashtags } from '../config.js';

export async function scrapeTikTok({ apifyToken, hashtags, keywords, maxTiktok }) {
  console.log('🎵 TikTok...');
  const searchTags = [...new Set([...hashtags, ...keywordsToHashtags(keywords)])];
  const items = await runApifyActor(apifyToken, 'clockworks~tiktok-scraper', {
    hashtags: searchTags,
    searchQueries: keywords,
    resultsPerPage: maxTiktok,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });
  return items.map(it => ({
    plataforma: 'tiktok',
    post_id: it.id || it.webVideoUrl,
    url: it.webVideoUrl || null,
    texto: it.text || it.desc || '',
    usuario: it.authorMeta?.name || it.authorMeta?.nickName || '',
    ubicacion_post: it.locationCreated || null,
    ts: it.createTimeISO || null,
  }));
}
