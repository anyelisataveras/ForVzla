/** Clasificación con Claude — categorías amplias (Python) + campos del schema (Node). */

const TIPOS = [
  'Rescate', 'Agua potable', 'Alimentos', 'Medicamentos', 'Médicos / paramédicos',
  'Refugio / carpas', 'Sangre / donantes', 'Transporte', 'Ropa / abrigo',
  'Comunicación / radios', 'Herramientas / Equipos', 'Otra',
];

const SYS = `Eres un clasificador de emergencias del terremoto de Venezuela (24-jun-2026).
Analiza el post y devuelve SOLO un JSON (sin markdown) con esta estructura exacta:
{
  "categoria": "necesidad" | "rescate" | "centro_acopio" | "voluntariado" | "replica_sismica" | "ayuda_intl" | "informativo" | "irrelevante",
  "tipo": string,
  "urgencia": "critica" | "urgente" | "normal",
  "zona": string,
  "direccion": string,
  "descripcion": string,
  "cantidad": string,
  "telefono": string,
  "confianza": number
}

Reglas:
- categoria "necesidad" = alguien PIDE ayuda/recursos concretos AHORA (pedido activo).
- categoria "rescate" = operación activa, personas atrapadas, evacuación urgente EN CURSO.
- centro_acopio = OFRECEN recibir donaciones (no es necesidad).
- voluntariado, ayuda_intl, replica_sismica, informativo, irrelevante = no son pedidos de ayuda.
- NOTICIAS ya resueltas (alguien "fue rescatado", "lograron sacar", emotivo sin pedido) → informativo, NO rescate.
- tipo: si categoria es necesidad o rescate, usa uno de: ${TIPOS.join(', ')}. Si rescate, prefiere "Rescate".
- urgencia "critica" SOLO si hay peligro de vida AHORA: atrapados bajo escombros, edificio a punto de caer, heridos graves sin atención.
- urgencia "urgente" = necesidad real pero sin vida en riesgo inmediato.
- urgencia "normal" = puede esperar horas.
- confianza: 0..1 qué tan seguro estás. Baja (<0.6) si el post es vago, genérico o mezcla varios temas.
- Señales de vida (→ rescate crítico): sobreviviente, está vivo/viva, sigue con vida, dio señales, golpes, responde, lo encontramos vivo.
- Atrapados / escombros: atrapado/a, sigue atrapado, no lo han sacado, bajo/entre escombros.
- Desaparecidos: desaparecido/a, sin noticias de, se busca a, búsqueda de.
- Necesidades: SOS, auxilio, ayuda urgente, sin agua/comida/luz, víveres, generadores.
- Operación rescate (contexto): rescatistas, brigada/equipo de rescate, maquinaria pesada, perros de rescate.
- centro de acopio / punto de encuentro = OFRECEN recibir (centro_acopio), no necesidad.`;

export const INGESTAR_CATEGORIAS = new Set(['necesidad', 'rescate']);

/** Se activa cuando Anthropic responde "sin saldo": corta la corrida en vez de reintentar 500 veces. */
export class SinSaldoError extends Error {}

export async function clasificar(post, apiKey) {
  const content = [
    `Plataforma: ${post.plataforma}`,
    `Autor: @${post.usuario || 'desconocido'}`,
    `Texto: ${(post.texto || '').slice(0, 1500)}`,
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYS,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 400 && /credit balance is too low/i.test(body)) {
      throw new SinSaldoError('Anthropic sin saldo (credit balance too low)');
    }
    console.warn('Claude', res.status, body.slice(0, 200));
    return null;
  }
  const data = await res.json();
  const raw = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}
