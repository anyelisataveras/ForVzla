import { PDFDocument, rgb, StandardFonts, PDFPage, PDFImage } from 'https://esm.sh/pdf-lib@1.17.1';
import {
  COLORS,
  CarnetSnapshot,
  LAYOUT,
  PAGE_PT,
  PlantillaConfig,
  pageSizeFromConfig,
} from './template-cuidadoras.ts';
import { TEMPLATE_BG_JPEG_B64 } from './template-background.ts';

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };

function safeText(value: unknown, max = 80): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

function fullName(snapshot: CarnetSnapshot): string {
  const parts = [safeText(snapshot.nombre), safeText(snapshot.apellido)].filter(Boolean);
  return parts.join(' ');
}

function rectPt(
  box: Rect,
  pageW: number,
  pageH: number,
): { x: number; y: number; w: number; h: number } {
  const w = box.w * pageW;
  const h = box.h * pageH;
  const x = box.x * pageW;
  const y = pageH - (box.y + box.h) * pageH;
  return { x, y, w, h };
}

async function embedRaster(
  pdf: PDFDocument,
  bytes: Uint8Array,
  mime: string,
): Promise<PDFImage> {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return pdf.embedPng(bytes);
  return pdf.embedJpg(bytes);
}

function coverRect(
  page: PDFPage,
  box: Rect,
  pageW: number,
  pageH: number,
  fill: { r: number; g: number; b: number },
) {
  const r = rectPt(box, pageW, pageH);
  page.drawRectangle({
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
    color: rgb(fill.r, fill.g, fill.b),
    borderWidth: 0,
  });
}

function drawField(
  page: PDFPage,
  label: string,
  value: string,
  bar: (typeof LAYOUT.bars)[0],
  fontLabel: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontValue: Awaited<ReturnType<PDFDocument['embedFont']>>,
  pageW: number,
  pageH: number,
  layout: typeof LAYOUT,
) {
  const r = rectPt(bar, pageW, pageH);
  const pageScale = pageW / PAGE_PT.width;
  const labelSize = (bar.labelSize ?? 9) * pageScale;
  const valueSize = bar.textSize * pageScale;
  const textX = r.x + r.w * layout.textInsetX;

  page.drawText(label, {
    x: textX,
    y: r.y + r.h * 0.78,
    size: labelSize,
    font: fontLabel,
    color: rgb(COLORS.label.r, COLORS.label.g, COLORS.label.b),
  });

  page.drawText(value || '—', {
    x: textX,
    y: r.y + r.h * 0.22,
    size: valueSize,
    font: fontValue,
    color: rgb(COLORS.text.r, COLORS.text.g, COLORS.text.b),
  });
}

async function drawPhoto(
  page: PDFPage,
  pdf: PDFDocument,
  photoBytes: Uint8Array,
  photoMime: string,
  pageW: number,
  pageH: number,
  layout: typeof LAYOUT,
) {
  const slot = layout.photo;
  const r = rectPt(slot, pageW, pageH);
  const inset = Math.min(r.w, r.h) * 0.04;
  const px = r.x + inset;
  const py = r.y + inset;
  const pw = r.w - inset * 2;
  const ph = r.h - inset * 2;

  try {
    const img = await embedRaster(pdf, photoBytes, photoMime);
    const scale = Math.max(pw / img.width, ph / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    const ix = px + (pw - iw) / 2;
    const iy = py + (ph - ih) / 2;
    page.drawImage(img, { x: ix, y: iy, width: iw, height: ih });
  } catch (_e) {
    page.drawRectangle({
      x: px,
      y: py,
      width: pw,
      height: ph,
      color: rgb(COLORS.photoBackdrop.r, COLORS.photoBackdrop.g, COLORS.photoBackdrop.b),
    });
  }
}

export async function renderCuidadorasCarnetPdf(
  snapshot: CarnetSnapshot,
  photoBytes: Uint8Array,
  photoMime: string,
  plantilla: PlantillaConfig | null,
  backgroundBytes?: Uint8Array | null,
  backgroundMime?: string | null,
): Promise<Uint8Array> {
  const { width, height } = pageSizeFromConfig(plantilla);
  const layout = plantilla?.layout ?? LAYOUT;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const nombreCompleto = fullName(snapshot);
  const cedula = safeText(snapshot.id_dni);
  const numero = snapshot.numero_voluntaria != null
    ? String(snapshot.numero_voluntaria)
    : '';

  const useCustomBg = Boolean(backgroundBytes?.length);
  let bgImg: PDFImage;
  if (useCustomBg) {
    bgImg = await embedRaster(pdf, backgroundBytes!, backgroundMime || 'image/png');
  } else {
    bgImg = await pdf.embedJpg(decodeBase64(TEMPLATE_BG_JPEG_B64));
  }
  page.drawImage(bgImg, { x: 0, y: 0, width, height });

  if (!useCustomBg) {
    coverRect(page, layout.photo, width, height, COLORS.photoBackdrop);
    for (const bar of layout.bars) {
      coverRect(page, bar, width, height, bar.fill);
    }
  }

  await drawPhoto(page, pdf, photoBytes, photoMime, width, height, layout);

  const values: Record<string, string> = {
    nombre_completo: nombreCompleto,
    cedula,
    numero,
  };

  layout.bars.forEach((bar) => {
    const key = bar.key as string;
    const val = values[key] ?? '';
    const label = bar.label ?? key.toUpperCase();
    drawField(
      page,
      label,
      val,
      bar,
      fontBold,
      bar.bold ? fontBold : font,
      width,
      height,
      layout,
    );
  });

  return pdf.save();
}
