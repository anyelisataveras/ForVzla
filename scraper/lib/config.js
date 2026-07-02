/** Configuración central — variables de entorno y constantes de búsqueda. */

const DEFAULT_KEYWORDS = [
  'terremoto Venezuela', 'sismo Caracas', 'centro de acopio Venezuela',
  'voluntarios Venezuela', '#terremotoVenezuela', '#sismoVenezuela',
  'necesitamos ayuda La Guaira', 'edificio colapsado Venezuela',
  'personas atrapadas terremoto', 'necesidades Venezuela'
];

const DEFAULT_HASHTAGS = [
  'AyudaVenezuela', 'TerremotoVenezuela', 'TerremotoYaracuy', 'LaGuaira',
  'SismoVenezuela', 'Caraballeda', 'VenezuelaTerremoto', 'SOSVenezuela',
  'terremotoVenezuela', 'sismoVenezuela'
];

function splitCsv(val, fallback = []) {
  if (!val) return fallback;
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

export function loadConfig() {
  const keywords = splitCsv(process.env.KEYWORDS, DEFAULT_KEYWORDS);
  const hashtags = splitCsv(process.env.HASHTAGS, DEFAULT_HASHTAGS);
  const platforms = splitCsv(
    process.env.PLATFORMS,
    ['instagram', 'tiktok', 'twitter', 'telegram']
  );
  const telegramChannels = splitCsv(process.env.TELEGRAM_CHANNELS);

  // Ventana de recencia: solo nos interesan los posts de las últimas N horas.
  // Rescate cambia por minutos; lo viejo genera ruido y quema tokens/créditos.
  const horasMax = +(process.env.HORAS_MAX || 24);
  const sinceMs = Date.now() - horasMax * 3600 * 1000;
  const sinceDate = new Date(sinceMs).toISOString().slice(0, 10); // YYYY-MM-DD para actores Apify

  return {
    apifyToken: process.env.APIFY_TOKEN,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    sbUrl: process.env.SUPABASE_URL || 'https://ebsgvamzaegjgpjkpick.supabase.co',
    sbKey: process.env.SUPABASE_KEY,
    dryRun: process.env.DRY_RUN === '1',
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    keywords,
    hashtags,
    platforms,
    telegramChannels,
    maxInstagram: +(process.env.MAX_RESULTS_INSTAGRAM || process.env.MAX_POR_FUENTE || 120),
    maxTiktok: +(process.env.MAX_RESULTS_TIKTOK || process.env.MAX_POR_FUENTE || 120),
    maxTwitter: +(process.env.MAX_RESULTS_TWITTER || process.env.MAX_POR_FUENTE || 120),
    maxTelegram: +(process.env.MAX_RESULTS_TELEGRAM || 100),
    radioDupM: +(process.env.RADIO_DUP_M || 200),
    horasMax,
    sinceMs,
    sinceDate,
  };
}

/** Convierte keywords a hashtags limpios (lógica del scraper Python). */
export function keywordsToHashtags(keywords) {
  const out = [];
  for (const kw of keywords) {
    const clean = kw.replace(/^#/, '').replace(/[^\w]/g, '');
    if (clean) out.push(clean);
  }
  return [...new Set(out)];
}
