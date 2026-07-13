/** Layout Cuidadoras Caracas — Canva 7×5 in (plantilla Renata Zavala). */
export const MM_TO_PT = 2.834645669;

/** 7 × 5 pulgadas (landscape), según export Canva. */
export const PAGE_MM = { width: 177.8, height: 127 };

export const PAGE_PT = {
  width: PAGE_MM.width * MM_TO_PT,
  height: PAGE_MM.height * MM_TO_PT,
};

/** Coordenadas normalizadas (origen arriba-izquierda, 0–1). */
export const LAYOUT = {
  /** Foto dentro del marco punteado izquierdo. */
  photo: { x: 0.048, y: 0.205, w: 0.255, h: 0.585 },
  /** Campos: nombre completo · cédula · número de voluntaria. */
  bars: [
    {
      key: 'nombre_completo',
      label: 'NOMBRE COMPLETO',
      x: 0.36,
      y: 0.32,
      w: 0.55,
      h: 0.12,
      fill: { r: 1, g: 0.93, b: 0.77 },
      labelSize: 9,
      textSize: 15,
      bold: true,
    },
    {
      key: 'cedula',
      label: 'CÉDULA',
      x: 0.36,
      y: 0.47,
      w: 0.55,
      h: 0.12,
      fill: { r: 0.98, g: 0.88, b: 0.87 },
      labelSize: 9,
      textSize: 14,
      bold: false,
    },
    {
      key: 'numero',
      label: 'NÚMERO DE VOLUNTARIA',
      x: 0.36,
      y: 0.62,
      w: 0.55,
      h: 0.12,
      fill: { r: 0.88, g: 0.92, b: 0.98 },
      labelSize: 9,
      textSize: 14,
      bold: false,
    },
  ],
  /** Margen izquierdo del texto dentro de cada campo. */
  textInsetX: 0.03,
  /** Logo del grupo — esquina superior derecha (reemplaza icono corazón Canva). */
  logo: { x: 0.775, y: 0.028, w: 0.19, h: 0.19 },
};

export const COLORS = {
  photoBackdrop: { r: 0.97, g: 0.97, b: 0.97 },
  label: { r: 0, g: 0.22, b: 0.58 },
  text: { r: 0.12, g: 0.12, b: 0.12 },
};

export type CarnetSnapshot = {
  nombre?: string;
  apellido?: string;
  id_dni?: string;
  numero_voluntaria?: number;
  foto_storage_path?: string;
  foto_mime_type?: string;
};

export type PlantillaConfig = {
  template_slug?: string;
  canva_url?: string;
  dimensions?: { width_mm?: number; height_mm?: number; width_in?: number; height_in?: number };
  layout?: typeof LAYOUT;
  background_storage_path?: string;
  background_mime_type?: string;
};

export function pageSizeFromConfig(config: PlantillaConfig | null) {
  const w = config?.dimensions?.width_mm ?? PAGE_MM.width;
  const h = config?.dimensions?.height_mm ?? PAGE_MM.height;
  return { width: w * MM_TO_PT, height: h * MM_TO_PT, widthMm: w, heightMm: h };
}
