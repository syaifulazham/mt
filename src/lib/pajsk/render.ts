/**
 * PAJSK certificate — A4 portrait, rendered in memory per request (nothing is
 * written to disk, as with src/lib/certificates/render.ts). Fixed layout, no
 * template: the colour follows the highest stage reached; the marks are always
 * per BSKK. Computer-generated, no signature, with the 10-character
 * verification code and a QR code to the public verification page.
 *
 * Coordinates here are pdf-lib's (origin bottom-left); `top(y)` converts from
 * a top-down y, the same single conversion the template renderer does.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { embedFonts } from "@/lib/certificates/fonts";
import { formatCode } from "./code";
import { placeLabel, type PajskRules } from "./rules";
import type { PajskEntry } from "./entries";

const W = 595.28, H = 841.89, M = 48;
const top = (y: number) => H - y;

function hexRgb(hex: string): RGB {
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
}
/** Mix a colour with white (t = 0 → colour, 1 → white). */
function tint(hex: string, t: number): RGB {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return rgb(c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t);
}

const INK = rgb(0.12, 0.12, 0.14), MUTED = rgb(0.42, 0.42, 0.46), RULE = rgb(0.85, 0.85, 0.87);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Centred text block from a top-down y; returns the y below it. Shrinks to at most `maxLines`. */
function centred(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, maxLines = 3, maxWidth = W - 2 * M): number {
  let s = size, lines = wrap(text, font, s, maxWidth);
  while (lines.length > maxLines && s > 9) { s -= 1; lines = wrap(text, font, s, maxWidth); }
  for (const l of lines) {
    page.drawText(l, { x: (W - font.widthOfTextAtSize(l, s)) / 2, y: top(y + s), size: s, font, color });
    y += s * 1.3;
  }
  return y;
}

export async function renderPajskPdf(entry: PajskEntry, rules: PajskRules, verifyUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Sijil PAJSK ${rules.programme} — ${entry.competitionCode}`);
  doc.setCreator("Malaysia Techlympics");
  doc.setProducer("Malaysia Techlympics");
  const page = doc.addPage([W, H]);
  const fonts = await embedFonts(doc, ["inter:normal", "inter:bold", "lora:bold"]);
  const regular = fonts.get("inter:normal")!, bold = fonts.get("inter:bold")!, serif = fonts.get("lora:bold")!;
  const colour = entry.colour, accent = hexRgb(colour);

  // Frame and header band in the stage colour
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: accent, borderWidth: 2 });
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: tint(colour, 0.6), borderWidth: 0.6 });
  page.drawRectangle({ x: 24, y: top(150), width: W - 48, height: 126, color: accent });
  let y = 50;
  y = centred(page, rules.programme.toUpperCase(), y, bold, 13, rgb(1, 1, 1), 1);
  y = centred(page, "SIJIL PENTAKSIRAN AKTIVITI JASMANI, SUKAN DAN KOKURIKULUM", y + 8, serif, 14, rgb(1, 1, 1), 2);
  centred(page, "(PAJSK)", y + 2, serif, 14, rgb(1, 1, 1), 1);

  // Stage ribbon
  const ribbon = entry.stageLabel.toUpperCase();
  const rw = bold.widthOfTextAtSize(ribbon, 10) + 28;
  page.drawRectangle({ x: (W - rw) / 2, y: top(176), width: rw, height: 20, color: tint(colour, 0.85), borderColor: accent, borderWidth: 0.8 });
  page.drawText(ribbon, { x: (W - bold.widthOfTextAtSize(ribbon, 10)) / 2, y: top(170), size: 10, font: bold, color: accent });

  y = 205;
  y = centred(page, "Dengan ini disahkan bahawa", y, regular, 11, MUTED, 1);
  y = centred(page, entry.recipientName.toUpperCase(), y + 10, serif, 22, INK, 2);
  if (entry.schoolName) y = centred(page, entry.schoolName, y + 4, regular, 11, MUTED, 2);
  y = centred(page, "telah mengambil bahagian dalam pertandingan", y + 16, regular, 11, MUTED, 1);
  y = centred(page, `${entry.competitionCode} ${entry.competitionName ?? ""}`.trim(), y + 8, bold, 15, INK, 2);
  if (entry.placing) {
    const achievement = [placeLabel(entry.placing), entry.medal ? `Pingat ${entry.medal}` : null].filter(Boolean).join(" · ");
    y = centred(page, `${achievement} (${entry.placingStageLabel ?? entry.stageLabel})`, y + 6, bold, 12, accent, 1);
  }

  // Marks table
  y += 26;
  const cols = [M + 6, M + 230, M + 390, W - M - 6]; // component | level | marks (right-aligned)
  const rowH = 30;
  page.drawRectangle({ x: M, y: top(y + rowH), width: W - 2 * M, height: rowH, color: tint(colour, 0.88) });
  const head = (t: string, x: number, right = false) =>
    page.drawText(t, { x: right ? x - bold.widthOfTextAtSize(t, 10) : x, y: top(y + 19), size: 10, font: bold, color: INK });
  head("KOMPONEN", cols[0]); head("PERINGKAT", cols[1]); head("MARKAH", cols[3], true);
  y += rowH;
  const rowsData: [string, string, string, string][] = [
    ["Pelibatan", rules.pelibatan.label, rules.pelibatan.level, String(entry.pelibatanMarks)],
  ];
  if (entry.pencapaianMarks != null && entry.placing)
    rowsData.push(["Pencapaian", placeLabel(entry.placing), rules.pencapaian.level, String(entry.pencapaianMarks)]);
  for (const [comp, detail, level, mk] of rowsData) {
    page.drawLine({ start: { x: M, y: top(y) }, end: { x: W - M, y: top(y) }, thickness: 0.5, color: RULE });
    page.drawText(comp, { x: cols[0], y: top(y + 15), size: 11, font: bold, color: INK });
    page.drawText(detail, { x: cols[0], y: top(y + 28), size: 9, font: regular, color: MUTED });
    page.drawText(level, { x: cols[1], y: top(y + 21), size: 11, font: regular, color: INK });
    page.drawText(mk, { x: cols[3] - bold.widthOfTextAtSize(mk, 14), y: top(y + 22), size: 14, font: bold, color: accent });
    y += 38;
  }
  page.drawLine({ start: { x: M, y: top(y) }, end: { x: W - M, y: top(y) }, thickness: 0.5, color: RULE });
  if (rules.reference) {
    y += 14;
    page.drawText(`Markah mengikut ${rules.reference}.`, { x: M, y: top(y + 8), size: 8.5, font: regular, color: MUTED });
  }

  // Verification block: QR + code
  const qrSize = 92, qrY = H - 70 - qrSize;
  const png = await QRCode.toBuffer(verifyUrl, { type: "png", margin: 0, width: 368, errorCorrectionLevel: "M" });
  page.drawImage(await doc.embedPng(new Uint8Array(png)), { x: M, y: H - qrY - qrSize, width: qrSize, height: qrSize });
  const tx = M + qrSize + 18;
  page.drawText("KOD PENGESAHAN", { x: tx, y: top(qrY + 12), size: 8.5, font: bold, color: MUTED });
  page.drawText(formatCode(entry.code), { x: tx, y: top(qrY + 38), size: 22, font: bold, color: INK });
  page.drawText("Sahkan sijil ini di:", { x: tx, y: top(qrY + 58), size: 8.5, font: regular, color: MUTED });
  const shortUrl = verifyUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
  page.drawText(shortUrl, { x: tx, y: top(qrY + 71), size: 9, font: bold, color: accent });
  page.drawText("Sijil ini dijana oleh komputer dan tidak memerlukan tandatangan.", {
    x: tx, y: top(qrY + 88), size: 8, font: regular, color: MUTED,
  });

  return doc.save();
}

export function pajskFilename(rules: PajskRules, entry: PajskEntry): string {
  return `PAJSK_${rules.year}_${entry.competitionCode.replace(/[^A-Za-z0-9.]+/g, "")}_${entry.code}.pdf`;
}

/** Public verification URL printed on the certificate (the code only — no names, no IC). */
export function verifyUrlFor(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/sahkan-pajsk?kod=${code}`;
}
