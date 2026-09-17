/**
 * The only place that maps configuration → PDF geometry.
 *
 * Nothing is ever written to disk: mt25 filled 135 GB of `public/uploads/
 * certificates/` before it moved to on-demand rendering, and that is not a
 * mistake worth repeating. Every certificate is rendered in memory, per request.
 *
 * Geometry, once:
 *   yPdf = pageHeight - y          (config y is from the top, in points)
 *   baseline is derived from real font metrics per `vAlign`
 *   x is the anchor; `align` decides which edge of the text sits on it
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import type { CertConfig, CertElement, CertTextStyle, FontId } from "./config-schema";
import { embedFonts, isStandardFont, winAnsiSafe, type FontKey } from "./fonts";
import { resolveFieldToken, type CertFieldSource } from "./fields";

export type BaseAsset = { url: string; type: "PDF" | "IMAGE" };

export type RenderInput = {
  config: CertConfig;
  baseAsset: BaseAsset;
  data: CertFieldSource;
  /** Origin used by `qr` elements that encode the verification URL. */
  appUrl?: string;
};

// Base assets are immutable (content-addressed on upload) and a bulk run asks for
// the same one thousands of times, so a small in-process cache pays for itself.
const assetCache = new Map<string, Uint8Array>();
const ASSET_CACHE_MAX = 8;

async function fetchAsset(url: string): Promise<Uint8Array> {
  const hit = assetCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Base asset fetch failed (${res.status}) for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (assetCache.size >= ASSET_CACHE_MAX) assetCache.delete(assetCache.keys().next().value!);
  assetCache.set(url, bytes);
  return bytes;
}

function hexToRgb(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function applyTransform(text: string, transform: CertTextStyle["transform"]): string {
  if (transform === "upper") return text.toUpperCase();
  if (transform === "title")
    return text.toLowerCase().replace(/(^|\s|[-'"(])([\p{L}])/gu, (_, p, c: string) => p + c.toUpperCase());
  return text;
}

function fontKey(style: CertTextStyle): FontKey {
  return `${style.font}:${style.weight}`;
}

function textWidth(font: PDFFont, text: string, size: number, letterSpacing = 0): number {
  const base = font.widthOfTextAtSize(text, size);
  return letterSpacing && text.length > 1 ? base + letterSpacing * (text.length - 1) : base;
}

/** Distance from the anchor line down to the baseline, in points. */
function baselineOffset(font: PDFFont, size: number, vAlign: CertElement["vAlign"]): number {
  const ascent = font.heightAtSize(size, { descender: false });
  const full   = font.heightAtSize(size);
  const descent = full - ascent;
  switch (vAlign) {
    case "baseline": return 0;
    case "top":      return ascent;
    case "middle":   return (ascent - descent) / 2;
    case "bottom":   return -descent;
  }
}

function alignShift(align: CertElement["align"], width: number): number {
  if (align === "center") return -width / 2;
  if (align === "right")  return -width;
  return 0;
}

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number, letterSpacing = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(font, candidate, size, letterSpacing) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function clipToWidth(font: PDFFont, text: string, size: number, maxWidth: number, letterSpacing = 0): string {
  if (textWidth(font, text, size, letterSpacing) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(font, `${out}...`, size, letterSpacing) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

function shrinkToWidth(font: PDFFont, text: string, size: number, maxWidth: number, letterSpacing = 0): number {
  let s = size;
  while (s > 5 && textWidth(font, text, s, letterSpacing) > maxWidth) s -= 0.5;
  return s;
}

type DrawTextArgs = {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  baselineY: number;
  size: number;
  color: string;
  align: CertElement["align"];
  letterSpacing?: number;
};

/**
 * pdf-lib has no character-spacing option, so spaced text is drawn glyph by
 * glyph. Everything else goes through a single drawText call.
 */
function drawTextLine({ page, font, text, x, baselineY, size, color, align, letterSpacing = 0 }: DrawTextArgs) {
  const width = textWidth(font, text, size, letterSpacing);
  let cursor = x + alignShift(align, width);
  const options = { size, font, color: hexToRgb(color) };

  if (!letterSpacing) {
    page.drawText(text, { ...options, x: cursor, y: baselineY });
    return;
  }
  for (const ch of text) {
    page.drawText(ch, { ...options, x: cursor, y: baselineY });
    cursor += font.widthOfTextAtSize(ch, size) + letterSpacing;
  }
}

export type RenderWarning = { elementId: string; message: string };

export async function renderCertificatePdf(
  input: RenderInput,
): Promise<{ bytes: Uint8Array; warnings: RenderWarning[] }> {
  const { config, baseAsset, data } = input;
  const warnings: RenderWarning[] = [];

  const assetBytes = await fetchAsset(baseAsset.url);

  let doc: PDFDocument;
  let page: PDFPage;
  let backgroundImage: PDFImage | null = null;

  if (baseAsset.type === "PDF") {
    doc  = await PDFDocument.load(assetBytes);
    page = doc.getPages()[0];
    if (!page) throw new Error("Base PDF has no pages");
  } else {
    doc = await PDFDocument.create();
    backgroundImage = assetBytes[0] === 0x89
      ? await doc.embedPng(assetBytes)
      : await doc.embedJpg(assetBytes);
    page = doc.addPage([config.canvas.width, config.canvas.height]);
    page.drawImage(backgroundImage, { x: 0, y: 0, width: config.canvas.width, height: config.canvas.height });
  }

  const { height: pageHeight } = page.getSize();

  const textElements = config.elements.filter(
    (el): el is Extract<CertElement, { type: "static_text" | "field" }> =>
      el.type === "static_text" || el.type === "field",
  );
  const fonts = await embedFonts(doc, textElements.map((el) => fontKey(el.style)));

  for (const el of [...config.elements].sort((a, b) => a.z - b.z)) {
    // yPdf is the anchor line; the baseline is derived from it per vAlign below.
    const anchorY = pageHeight - el.y;

    if (el.type === "image") {
      const bytes = await fetchAsset(el.url).catch(() => null);
      if (!bytes) { warnings.push({ elementId: el.id, message: `image fetch failed: ${el.url}` }); continue; }
      const img = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      page.drawImage(img, { x: el.x, y: anchorY - el.height, width: el.width, height: el.height, opacity: el.opacity });
      continue;
    }

    if (el.type === "qr") {
      const payload =
        el.encodes === "unique_code"   ? data.uniqueCode :
        el.encodes === "serial_number" ? data.serialNumber :
        `${(input.appUrl ?? "").replace(/\/$/, "")}/verify/${data.uniqueCode}`;
      const png = await QRCode.toBuffer(payload, { type: "png", margin: 0, width: Math.ceil(el.size * 4) });
      const img = await doc.embedPng(new Uint8Array(png));
      page.drawImage(img, { x: el.x, y: anchorY - el.size, width: el.size, height: el.size });
      continue;
    }

    // ── text ──────────────────────────────────────────────────────────────────
    let value: string;
    if (el.type === "static_text") {
      value = el.text;
    } else {
      const resolved = resolveFieldToken(el.field, data);
      if (resolved === null) { warnings.push({ elementId: el.id, message: `unknown field ${el.field}` }); continue; }
      value = resolved || (el.fallback ?? "");
      if (value) value = `${el.prefix ?? ""}${value}${el.suffix ?? ""}`;
    }

    value = applyTransform(value, el.style.transform);
    if (!value) continue;

    if (isStandardFont(el.style.font as FontId)) {
      const safe = winAnsiSafe(value);
      if (safe.substituted)
        warnings.push({ elementId: el.id, message: "characters outside WinAnsi replaced — use an embedded font" });
      value = safe.text;
    }

    const font = fonts.get(fontKey(el.style))!;
    const spacing = el.style.letterSpacing ?? 0;
    let size = el.style.size;
    let lines = [value];

    if (el.maxWidth) {
      if (el.fit === "shrink")    size = shrinkToWidth(font, value, size, el.maxWidth, spacing);
      else if (el.fit === "wrap") lines = wrapLines(font, value, size, el.maxWidth, spacing);
      else                        lines = [clipToWidth(font, value, size, el.maxWidth, spacing)];
    }

    const lineHeight = (el.style.lineHeight ?? 1.2) * size;
    const firstBaseline = anchorY - baselineOffset(font, size, el.vAlign);

    lines.forEach((line, i) => {
      drawTextLine({
        page, font, text: line, x: el.x, baselineY: firstBaseline - i * lineHeight,
        size, color: el.style.color, align: el.align, letterSpacing: spacing,
      });
    });
  }

  return { bytes: await doc.save(), warnings };
}

/** `MT26_PART_MT26-PART-000001.pdf` — safe on every filesystem. */
export function certificateFilename(seasonCode: string, templateName: string, serial: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9-]+/g, "_").replace(/^_|_$/g, "");
  return `${clean(seasonCode)}_${clean(templateName)}_${clean(serial)}.pdf`;
}
