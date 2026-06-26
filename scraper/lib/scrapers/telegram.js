const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Telegram Bot API — el bot debe ser miembro/admin del canal.
 * Portado desde Python; para canales públicos sin bot usar Telethon (solo Python).
 */
export async function scrapeTelegram({ telegramToken, telegramChannels, keywords, maxTelegram }) {
  if (!telegramToken) {
    console.log('  [Telegram] TELEGRAM_BOT_TOKEN no configurado — omitiendo');
    return [];
  }
  if (!telegramChannels.length) {
    console.log('  [Telegram] TELEGRAM_CHANNELS vacío — omitiendo');
    return [];
  }

  console.log('✈️  Telegram...');
  const posts = [];

  for (const channel of telegramChannels) {
    const msgs = await getChannelMessages(telegramToken, channel, maxTelegram);
    for (const msg of msgs) {
      if (keywords.length) {
        const lower = (msg.texto || '').toLowerCase();
        if (!keywords.some(kw => lower.includes(kw.toLowerCase()))) continue;
      }
      posts.push(msg);
    }
    await sleep(1000);
  }

  console.log(`  [Telegram] ✓ ${posts.length} mensajes`);
  return posts;
}

async function getChannelMessages(botToken, channel, limit) {
  const base = `https://api.telegram.org/bot${botToken}`;
  try {
    const resp = await fetch(
      `${base}/getUpdates?limit=${limit}&allowed_updates=${encodeURIComponent(JSON.stringify(['channel_post']))}`
    );
    if (!resp.ok) throw new Error(`${resp.status}`);
    const updates = (await resp.json()).result || [];

    const posts = [];
    for (const upd of updates) {
      const msg = upd.channel_post || upd.message;
      if (!msg) continue;
      const chat = msg.chat || {};
      const username = (chat.username || '').toLowerCase();
      if (!username.includes(channel.toLowerCase().replace('@', ''))) continue;
      posts.push(normalizeTelegram(msg, channel));
    }
    return posts;
  } catch (e) {
    console.warn(`    [Telegram] Error en @${channel}:`, e.message);
    return [];
  }
}

function normalizeTelegram(msg, channel) {
  const chat = msg.chat || {};
  const channelUser = chat.username || channel.replace('@', '');
  const msgId = msg.message_id;
  return {
    plataforma: 'telegram',
    post_id: String(msgId),
    url: `https://t.me/${channelUser}/${msgId}`,
    texto: msg.text || msg.caption || '',
    usuario: channelUser,
    ubicacion_post: null,
    ts: msg.date ? new Date(msg.date * 1000).toISOString() : null,
  };
}
