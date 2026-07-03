/** Reglas de calidad post-clasificación: pedido activo, urgencia creíble, cola de moderación. */

// Palabras clave PM — pedido activo (necesidad o rescate en curso).
const PEDIDO_ACTIVO = /necesit|urgente|atrapad|colaps|solicit|pedimos|falta|sin agua|sin comida|sin luz|v[ií]veres|ayuda|auxilio|\bsos\b|rescate|escombros|desaparecid|generador/i;
const NOTICIA_RESUELTA = /fue rescatad|ya fue rescat|lograron rescatar|rescatad[oa]s?\s+(del|de los|hace|en)|operaci[oó]n exitosa|celebramos|emotivo rescate|historia de|sobrevivi[oó]\b|ya (lo|la) sacaron|lograron sacar/i;

// Rescate activo: atrapados, escombros, desaparecidos, operación en curso.
const RESCATE_PROBABLE = /atrapad|sigue atrapad|soterrad|bajo (los |el )?escombros|entre los escombros|escombros|derrumb|colaps|desaparecid|no pueden salir|siguen adentro|siguen dentro|no (lo|la) han sacado|rescate|rescatistas|equipo de rescate|brigada de rescate|maquinaria pesada|perros de rescate|sin noticias de|no aparece|se busca a|b[uú]squeda de/i;
// Signos de vida = prioridad absoluta para el equipo de rescate.
const SIGNOS_VIDA = /signos de vida|se escuchan|se oyen|golpean|golpes|dando golpes|piden auxilio|responde|responden|siguen con vida|sigue con vida|est[aá] (vivo|viva)|est[aá]n viv[oa]s?|hay vida|escuchamos|sobreviviente|dio se[nñ]ales|(lo|la) encontramos (vivo|viva)|\bcon vida\b/i;

export function esPedidoActivo(texto) {
  const t = (texto || '').toLowerCase();
  if (NOTICIA_RESUELTA.test(t)) return false;
  if (SIGNOS_VIDA.test(t)) return true;
  return PEDIDO_ACTIVO.test(t);
}

/** ¿El texto sugiere una operación de rescate activa (personas atrapadas)? */
export function esRescateProbable(texto) {
  const t = (texto || '').toLowerCase();
  if (NOTICIA_RESUELTA.test(t)) return false;
  if (SIGNOS_VIDA.test(t)) return true;
  return RESCATE_PROBABLE.test(t);
}

/** ¿Menciona signos de vida? Prioridad absoluta para el equipo de rescate. */
export function tieneSignosVida(texto) {
  return SIGNOS_VIDA.test((texto || '').toLowerCase());
}

export function zonaUtil(zona) {
  const z = (zona || '').trim();
  if (!z || /^otra$/i.test(z) || /^venezuela$/i.test(z)) return false;
  return true;
}

/**
 * Ajusta urgencia y si entra a cola de moderación.
 * @returns {{ urgencia: string, estadoPost: 'pendiente'|'descartado', motivo?: string }}
 */
export function evaluarCandidato(c, post, geo, { confMin = 0.65 } = {}) {
  const texto = `${post.texto || ''} ${c.descripcion || ''}`;
  const conf = c.confianza ?? 0;
  const hasGeo = geo?.lat != null && geo?.lng != null;
  const hasZona = zonaUtil(c.zona);
  const hasContact = !!(c.telefono?.trim()) || !!(post.url?.trim());
  const activo = esPedidoActivo(texto);
  const rescate = c.categoria === 'rescate';
  const signosVida = tieneSignosVida(texto);

  let urgencia = c.urgencia || 'urgente';
  if (urgencia === 'critica') {
    if (!activo) urgencia = 'urgente';
    else if (!rescate && !hasGeo && !hasZona) urgencia = 'urgente';
    else if (rescate && !hasGeo && !hasZona && !hasContact) urgencia = 'urgente';
  }
  // Rescate con signos de vida = crítica sí o sí (mientras haya pedido activo).
  if (rescate && signosVida && activo) urgencia = 'critica';
  // Un rescate nunca baja de urgente.
  if (rescate && urgencia === 'normal') urgencia = 'urgente';

  if (!activo) {
    return { urgencia, estadoPost: 'descartado', motivo: 'noticia_o_sin_pedido_activo' };
  }
  if (conf < confMin) {
    return { urgencia, estadoPost: 'descartado', motivo: 'confianza_baja' };
  }
  if (urgencia === 'critica' && !rescate && conf < 0.8) {
    return { urgencia: 'urgente', estadoPost: 'pendiente', motivo: 'critica_sin_rescate_downgrade' };
  }
  if (rescate && (hasGeo || hasZona || hasContact)) {
    return { urgencia, estadoPost: 'pendiente' };
  }
  if (c.categoria === 'necesidad' && hasZona && (hasGeo || hasContact)) {
    return { urgencia, estadoPost: 'pendiente' };
  }
  if (conf >= 0.8 && hasZona) {
    return { urgencia, estadoPost: 'pendiente' };
  }

  return { urgencia, estadoPost: 'descartado', motivo: 'datos_insuficientes' };
}
