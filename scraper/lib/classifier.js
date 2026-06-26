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
- categoria "necesidad" = alguien PIDE ayuda/recursos concretos.
- categoria "rescate" = operación activa, personas atrapadas, evacuación urgente.
- centro_acopio = OFRECEN recibir donaciones (no es necesidad).
- voluntariado, ayuda_intl, replica_sismica, informativo, irrelevante = no son pedidos de ayuda.
- tipo: si categoria es necesidad o rescate, usa uno de: ${TIPOS.join(', ')}. Si rescate, prefiere "Rescate".
- confianza: 0..1 qué tan seguro estás de la clasificación.`;

export const INGESTAR_CATEGORIAS = new Set(['necesidad', 'rescate']);

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
    console.warn('Claude', res.status);
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
