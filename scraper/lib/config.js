/** Configuración central — variables de entorno y constantes de búsqueda. */

// Términos PM (refinamiento de posts) → frases de búsqueda Apify.
// Orden: signos de vida primero (TikTok solo usa los primeros N en searchQueries).
const DEFAULT_KEYWORDS = [
  // ── Signos de vida (prioridad máxima) ──
  'signos de vida escombros', 'se escuchan golpes escombros',
  'sobreviviente escombros Venezuela', 'sobrevivientes terremoto Venezuela',
  'está vivo bajo escombros', 'está viva bajo escombros',
  'sigue con vida escombros', 'hay vida bajo escombros',
  'encontramos vivo escombros', 'dio señales de vida',
  'responde bajo escombros', 'golpes bajo escombros',
  // ── Atrapados / escombros ──
  'personas atrapadas terremoto', 'sigue atrapado escombros',
  'no lo han sacado escombros', 'bajo los escombros Venezuela',
  'entre los escombros terremoto', 'atrapados vivos terremoto',
  'piden auxilio bajo escombros', 'auxilio atrapados La Guaira',
  // ── Rescate activo ──
  'rescate personas atrapadas Venezuela', 'brigada de rescate Venezuela',
  'equipo de rescate escombros', 'rescatistas terremoto Venezuela',
  'maquinaria pesada rescate Venezuela', 'perros de rescate escombros',
  // ── Desaparecidos ──
  'desaparecidos terremoto Venezuela', 'sin noticias de terremoto',
  'se busca terremoto Venezuela', 'búsqueda de desaparecidos Venezuela',
  // ── Necesidades urgentes ──
  'SOS terremoto Venezuela', 'auxilio urgente Venezuela',
  'ayuda urgente terremoto', 'sin agua terremoto Venezuela',
  'sin comida terremoto Venezuela', 'necesitamos víveres Venezuela',
  'sin luz generadores Venezuela',
  // ── Contexto / acopio (centros, no necesidad) ──
  'centro de acopio Venezuela', 'punto de encuentro terremoto',
  'terremoto Venezuela', 'edificio colapsado Venezuela',
];

const DEFAULT_HASHTAGS = [
  // Geografía
  'AyudaVenezuela', 'TerremotoVenezuela', 'TerremotoYaracuy', 'LaGuaira',
  'SismoVenezuela', 'Caraballeda', 'VenezuelaTerremoto', 'PlayaGrande', 'Vargas',
  'terremotoVenezuela', 'sismoVenezuela',
  // PM — signos de vida / atrapados
  'SignosDeVida', 'AtrapadosConVida', 'HayVida', 'Sobreviviente',
  'PersonasAtrapadas', 'BajoEscombros',
  // PM — rescate / desaparecidos / auxilio
  'RescateVenezuela', 'Desaparecidos', 'AUXILIO', 'SOSVenezuela',
  'AuxilioUrgente', 'BrigadaRescate', 'MaquinariaPesada',
  // PM — necesidades
  'SinAgua', 'SinComida', 'SinLuz',
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
