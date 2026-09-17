/**
 * Certificate template configuration — schema v2, plus the one-way v1 upgrader.
 *
 * Geometry contract (the whole point of v2):
 *   unit   = PDF points (1/72"), never pixels
 *   origin = top-left, y grows downward
 *   anchor = per-element `align` / `vAlign`; the renderer does the single
 *            conversion `yPdf = pageHeight - y` using real font metrics.
 *
 * mt25 stored pixels-ish coordinates plus per-template `calibration`
 * (scaleX/scaleY/offsetY/baselineRatio) because its editor and renderer
 * disagreed about all three of the above. `upgradeConfig` folds that calibration
 * into absolute coordinates exactly once, here, so nothing downstream ever sees
 * it again.
 */

import { z } from "zod";
import { CERT_FIELD_TOKENS, normaliseFieldToken } from "./fields";

export const FONT_IDS = ["helvetica", "inter", "lora"] as const;
export type FontId = (typeof FONT_IDS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna mesti #rrggbb");

const styleSchema = z.object({
  font:          z.enum(FONT_IDS).default("inter"),
  size:          z.number().min(4).max(200),
  weight:        z.enum(["normal", "bold"]).default("normal"),
  color:         hexColor.default("#000000"),
  letterSpacing: z.number().min(-5).max(20).optional(),
  lineHeight:    z.number().min(0.5).max(3).optional(),
  transform:     z.enum(["none", "upper", "title"]).default("none"),
});

const baseElement = {
  id:     z.string().min(1),
  z:      z.number().int().default(0),
  x:      z.number(),
  y:      z.number(),
  align:  z.enum(["left", "center", "right"]).default("left"),
  vAlign: z.enum(["top", "middle", "baseline", "bottom"]).default("baseline"),
};

const staticTextElement = z.object({
  ...baseElement,
  type:     z.literal("static_text"),
  text:     z.string(),
  maxWidth: z.number().positive().optional(),
  fit:      z.enum(["shrink", "wrap", "clip"]).default("shrink"),
  style:    styleSchema,
});

const fieldElement = z.object({
  ...baseElement,
  type:     z.literal("field"),
  field:    z.enum(CERT_FIELD_TOKENS),
  prefix:   z.string().optional(),
  suffix:   z.string().optional(),
  fallback: z.string().optional(),
  maxWidth: z.number().positive().optional(),
  fit:      z.enum(["shrink", "wrap", "clip"]).default("shrink"),
  style:    styleSchema,
});

const imageElement = z.object({
  ...baseElement,
  type:    z.literal("image"),
  url:     z.string().url(),
  width:   z.number().positive(),
  height:  z.number().positive(),
  opacity: z.number().min(0).max(1).optional(),
});

const qrElement = z.object({
  ...baseElement,
  type:    z.literal("qr"),
  encodes: z.enum(["verify_url", "unique_code", "serial_number"]).default("verify_url"),
  size:    z.number().positive(),
});

export const certElementSchema = z.discriminatedUnion("type", [
  staticTextElement,
  fieldElement,
  imageElement,
  qrElement,
]);

export const certConfigSchema = z.object({
  v: z.literal(2),
  canvas: z.object({
    paper:       z.enum(["A4", "A3", "LETTER", "CUSTOM"]).default("A4"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    width:       z.number().positive(),   // points
    height:      z.number().positive(),
    /**
     * Editor-only: the artwork's optical centre, in points from the left edge.
     * The renderer ignores it — it exists because a certificate's blank area is
     * rarely centred on the page, so "centre this text" means "centre it on the
     * artwork", not on the paper. Stored with the template so it is not
     * rediscovered by every organizer who opens it.
     */
    centerGuide: z.number().optional(),
  }),
  elements: z.array(certElementSchema),
});

export type CertConfig     = z.infer<typeof certConfigSchema>;
export type CertElement    = z.infer<typeof certElementSchema>;
export type CertTextStyle  = z.infer<typeof styleSchema>;

export const PAPER_SIZES = {
  A4:     { width: 595, height: 842 },
  A3:     { width: 842, height: 1191 },
  LETTER: { width: 612, height: 792 },
} as const;

export function emptyConfig(
  paper: keyof typeof PAPER_SIZES = "A4",
  orientation: "portrait" | "landscape" = "portrait",
): CertConfig {
  const { width, height } = PAPER_SIZES[paper];
  return {
    v: 2,
    canvas: {
      paper,
      orientation,
      width:  orientation === "portrait" ? width  : height,
      height: orientation === "portrait" ? height : width,
    },
    elements: [],
  };
}

// ── v1 (mt25) ────────────────────────────────────────────────────────────────

type V1Element = {
  id?: string;
  type?: string;
  layer?: number;
  content?: string;
  placeholder?: string;
  prefix?: string;
  position?: { x?: number; y?: number };
  text_anchor?: "start" | "middle" | "end";
  style?: {
    font_family?: string;
    font_size?: string | number;
    font_weight?: string;
    color?: string;
    align?: string;
  };
};

type V1Config = {
  canvas?: { width?: number; height?: number; orientation?: string; paperSize?: string };
  elements?: V1Element[];
  calibration?: { scaleX?: number; scaleY?: number; offsetY?: number; baselineRatio?: number };
};

/**
 * mt25's renderer placed the baseline at
 *
 *   baselineY_pdf = pageHeight - (y * scaleY + offsetY) - (size * baselineRatio + fontFudge)
 *                              + (size > 30 ? size * 0.02 : 0)
 *
 * where `fontFudge` was 5 % of the size for Georgia and 3 % for Times. v2 places
 * a `vAlign: "baseline"` element at `pageHeight - y`, so the faithful conversion
 * is simply the distance from the top edge down to that same baseline.
 */
function v1BaselineFromTop(el: V1Element, size: number, cal: Required<NonNullable<V1Config["calibration"]>>): number {
  const family = (el.style?.font_family ?? "Arial").toLowerCase();
  const fontFudge = family.includes("georgia") ? size * 0.05 : family.includes("times") ? size * 0.03 : 0;
  const largeTextFudge = size > 30 ? size * 0.02 : 0;
  return (el.position?.y ?? 0) * cal.scaleY + cal.offsetY + size * cal.baselineRatio + fontFudge - largeTextFudge;
}

const ANCHOR_TO_ALIGN = { start: "left", middle: "center", end: "right" } as const;

export type UpgradeReport = { dropped: { reason: string; element: unknown }[] };

/**
 * Upgrade an mt25 configuration to v2. Lossy on purpose in two places, both
 * matching what mt25 actually *rendered* rather than what it stored:
 *
 * - every font becomes `helvetica`, because mt25 embedded Helvetica /
 *   Helvetica-Bold and ignored `font_family` entirely (it only leaked into the
 *   baseline fudge, which is folded into `y` above);
 * - dynamic values get `transform: "upper"`, because the renderer called
 *   `.toUpperCase()` on every one of them.
 */
export function upgradeV1Config(raw: unknown, report?: UpgradeReport): CertConfig {
  const v1 = (raw ?? {}) as V1Config;
  const cal = {
    scaleX:        v1.calibration?.scaleX        ?? 1,
    scaleY:        v1.calibration?.scaleY        ?? 1,
    offsetY:       v1.calibration?.offsetY       ?? 0,
    baselineRatio: v1.calibration?.baselineRatio ?? 0.35,
  };

  const width  = v1.canvas?.width  ?? PAPER_SIZES.A4.width;
  const height = v1.canvas?.height ?? PAPER_SIZES.A4.height;
  const orientation = width > height ? "landscape" : "portrait";

  const elements: CertElement[] = [];
  for (const el of v1.elements ?? []) {
    const size = Number(el.style?.font_size ?? 16) || 16;
    const common = {
      id:     el.id ?? `el_${elements.length + 1}`,
      z:      el.layer ?? elements.length,
      x:      (el.position?.x ?? 0) * cal.scaleX,
      y:      v1BaselineFromTop(el, size, cal),
      align:  ANCHOR_TO_ALIGN[el.text_anchor ?? "start"],
      vAlign: "baseline" as const,
    };
    const style = {
      font:   "helvetica" as const,
      size,
      weight: el.style?.font_weight === "bold" ? ("bold" as const) : ("normal" as const),
      color:  /^#[0-9a-fA-F]{6}$/.test(el.style?.color ?? "") ? el.style!.color! : "#000000",
    };

    if (el.type === "static_text") {
      elements.push({
        ...common, type: "static_text", text: el.content ?? "", fit: "shrink",
        style: { ...style, transform: "none" },
      });
      continue;
    }

    if (el.type === "dynamic_text") {
      const token = normaliseFieldToken(el.placeholder ?? "");
      if (!token) {
        report?.dropped.push({ reason: `unknown placeholder ${el.placeholder}`, element: el });
        continue;
      }
      elements.push({
        ...common, type: "field", field: token, prefix: el.prefix || undefined, fit: "shrink",
        style: { ...style, transform: "upper" },
      });
      continue;
    }

    report?.dropped.push({ reason: `unsupported element type ${el.type}`, element: el });
  }

  return certConfigSchema.parse({
    v: 2,
    canvas: { paper: "A4", orientation, width, height },
    elements,
  });
}

/** Accepts v1 or v2 and always returns validated v2. */
export function parseConfig(raw: unknown, report?: UpgradeReport): CertConfig {
  if (raw && typeof raw === "object" && (raw as { v?: unknown }).v === 2) return certConfigSchema.parse(raw);
  return upgradeV1Config(raw, report);
}
