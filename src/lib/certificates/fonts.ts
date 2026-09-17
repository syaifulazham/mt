/**
 * Font registry for certificate rendering.
 *
 * mt25 embedded only Helvetica/Helvetica-Bold while letting the editor pick
 * Arial, Georgia or Times — so previews lied and per-font baseline fudges were
 * invented to compensate. Here the editor may only choose fonts this file can
 * actually embed.
 *
 * `helvetica` is kept because imported mt25 templates rendered as Helvetica, and
 * 117 k issued certificates must keep looking the way they were issued. It is a
 * PDF standard font, so it is WinAnsi-only — see `winAnsiSafe`.
 */

import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { FontId } from "./config-schema";

type FontDef =
  | { kind: "standard"; label: string; normal: StandardFonts; bold: StandardFonts }
  | { kind: "embedded"; label: string; normal: string; bold: string };

export const FONT_REGISTRY: Record<FontId, FontDef> = {
  helvetica: {
    kind:   "standard",
    label:  "Helvetica (warisan)",
    normal: StandardFonts.Helvetica,
    bold:   StandardFonts.HelveticaBold,
  },
  inter: {
    kind:   "embedded",
    label:  "Inter",
    normal: "Inter_400Regular.ttf",
    bold:   "Inter_700Bold.ttf",
  },
  lora: {
    kind:   "embedded",
    label:  "Lora",
    normal: "Lora_400Regular.ttf",
    bold:   "Lora_700Bold.ttf",
  },
};

// public/ is what the Docker runner copies out of the build, so the TTFs live there.
const FONT_DIR = path.join(process.cwd(), "public", "fonts", "certificates");

const fileCache = new Map<string, Buffer>();

async function fontBytes(file: string): Promise<Buffer> {
  const cached = fileCache.get(file);
  if (cached) return cached;
  const bytes = await readFile(path.join(FONT_DIR, file));
  fileCache.set(file, bytes);
  return bytes;
}

export type FontKey = `${FontId}:${"normal" | "bold"}`;

/**
 * Embeds every font the elements ask for, once per document. `registerFontkit` is
 * only called when a TTF is actually needed.
 */
export async function embedFonts(doc: PDFDocument, keys: Iterable<FontKey>): Promise<Map<FontKey, PDFFont>> {
  const out = new Map<FontKey, PDFFont>();
  let fontkitRegistered = false;

  for (const key of new Set(keys)) {
    const [id, weight] = key.split(":") as [FontId, "normal" | "bold"];
    const def = FONT_REGISTRY[id] ?? FONT_REGISTRY.inter;
    if (def.kind === "standard") {
      out.set(key, await doc.embedFont(weight === "bold" ? def.bold : def.normal));
      continue;
    }
    if (!fontkitRegistered) {
      doc.registerFontkit(fontkit);
      fontkitRegistered = true;
    }
    // subset: only the glyphs actually used, which keeps a certificate ~30 kB
    out.set(key, await doc.embedFont(await fontBytes(weight === "bold" ? def.bold : def.normal), { subset: true }));
  }
  return out;
}

/** Characters the standard-14 fonts can't encode, mapped to something printable. */
const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201A": ",", "\u201C": '"', "\u201D": '"',
  "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u2022": "*", "\u00A0": " ",
};

/**
 * pdf-lib throws when a standard font is asked to encode a character outside
 * WinAnsi — which would mean a Chinese or Tamil school name taking down the whole
 * download. Substitute instead, and let the caller log it.
 *
 * Templates that need those scripts should use an embedded font; adding one
 * (e.g. Noto Sans) is a matter of dropping the TTF into FONT_REGISTRY.
 */
export function winAnsiSafe(text: string): { text: string; substituted: boolean } {
  let substituted = false;
  const out = [...text]
    .map((ch) => {
      const mapped = WIN_ANSI_REPLACEMENTS[ch];
      if (mapped !== undefined) return mapped;
      if (ch.codePointAt(0)! <= 0xff) return ch;
      substituted = true;
      return "?";
    })
    .join("");
  return { text: out, substituted };
}

export function isStandardFont(id: FontId): boolean {
  return FONT_REGISTRY[id]?.kind === "standard";
}
