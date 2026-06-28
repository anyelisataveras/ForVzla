/** Reglas de calidad post-clasificación: pedido activo, urgencia creíble, cola de moderación. */

const PEDIDO_ACTIVO = /necesit|urgente|atrapad|colaps|solicit|pedimos|falta|sin agua|sin luz|ayuda|rescate|escombros|desaparecid/i;
const NOTICIA_RESUELTA = /fue rescatad|ya fue rescat|lograron rescatar|rescatad[oa]s?\s+(del|de los|hace|en)|operación exitosa|celebramos|emotivo rescate|historia de/i;

export function esPedidoActivo(texto) {
  const t = (texto || '').toLowerCase();
  if (NOTICIA_RESUELTA.test(t)) return false;
  return PEDIDO_ACTIVO.test(t);
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

  let urgencia = c.urgencia || 'urgente';
  if (urgencia === 'critica') {
    if (!activo) urgencia = 'urgente';
    else if (!rescate && !hasGeo && !hasZona) urgencia = 'urgente';
    else if (rescate && !hasGeo && !hasZona && !hasContact) urgencia = 'urgente';
  }

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
