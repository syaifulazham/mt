import { z } from "zod";

// Custom landing page sections: shared by the organizer editor, the API and
// the public renderer. Content is a list of typed blocks (no raw HTML), so the
// public page never renders markup an editor or the AI typed in.

// ── URLs ─────────────────────────────────────────────────────────────────────

/** http(s) or a site-relative path — for images. */
const imageUrl = z.string().trim().max(2000).refine(
  (u) => u === "" || /^https?:\/\//i.test(u) || (u.startsWith("/") && !u.startsWith("//")),
  "Image URL must start with https:// or /",
);
/** Links may also be in-page anchors or mailto:. */
const linkUrl = z.string().trim().max(2000).refine(
  (u) => u === "" || /^(https?:\/\/|mailto:|#)/i.test(u) || (u.startsWith("/") && !u.startsWith("//")),
  "Link must start with https://, /, # or mailto:",
);

const text = (max: number) => z.string().max(max).default("");
const align = z.enum(["left", "center"]).default("left");

const image = z.object({
  url: imageUrl.default(""),
  alt: text(300),
  caption: text(500),
});

// ── Blocks ───────────────────────────────────────────────────────────────────

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("heading"), text: text(300), level: z.union([z.literal(2), z.literal(3)]).default(3), align }),
  z.object({ id: z.string(), type: z.literal("text"), markdown: text(20000), align }),
  z.object({ id: z.string(), type: z.literal("image"), image, width: z.enum(["full", "wide", "medium"]).default("wide") }),
  z.object({ id: z.string(), type: z.literal("images"), items: z.array(image).max(48).default([]), columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3) }),
  z.object({ id: z.string(), type: z.literal("media"), image, markdown: text(20000), side: z.enum(["left", "right"]).default("left") }),
  z.object({
    id: z.string(), type: z.literal("cards"),
    items: z.array(z.object({ title: text(200), text: text(2000), image: imageUrl.default(""), url: linkUrl.default("") })).max(24).default([]),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  z.object({
    id: z.string(), type: z.literal("stats"),
    items: z.array(z.object({ value: text(40), label: text(120) })).max(8).default([]),
  }),
  z.object({
    id: z.string(), type: z.literal("buttons"),
    items: z.array(z.object({ label: text(80), url: linkUrl.default(""), variant: z.enum(["primary", "secondary"]).default("primary") })).max(6).default([]),
    align,
  }),
  z.object({ id: z.string(), type: z.literal("video"), url: linkUrl.default(""), caption: text(500) }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;
export type SectionImage = z.infer<typeof image>;

export const BACKGROUNDS = ["white", "light", "dark", "brand"] as const;
export type Background = (typeof BACKGROUNDS)[number];

// ── Backdrop: optional image + colour fill over the section background ───────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be #RRGGBB");

export const backdropSchema = z.object({
  image: imageUrl.default(""),
  position: z.enum(["center", "top", "bottom"]).default("center"),
  /** Image stays still while the page scrolls. */
  parallax: z.boolean().default(false),
  fill: z.enum(["none", "solid", "gradient"]).default("none"),
  color: hex.default("#001f5b"),
  color2: hex.default("#003893"),
  angle: z.number().int().min(0).max(360).default(135),
  /** Fill opacity, 0–100. */
  opacity: z.number().int().min(0).max(100).default(70),
  /** Text colour; "auto" follows the Background preset. */
  text: z.enum(["auto", "light", "dark"]).default("auto"),
});
export type Backdrop = z.infer<typeof backdropSchema>;

export const DEFAULT_BACKDROP: Backdrop = backdropSchema.parse({});

/** A backdrop that changes nothing is stored as null. */
export function isBackdropActive(b: Backdrop | null | undefined): b is Backdrop {
  return !!b && (!!b.image || b.fill !== "none" || b.text !== "auto");
}

export function parseBackdrop(raw: unknown): Backdrop | null {
  const r = backdropSchema.safeParse(raw ?? undefined);
  return r.success && raw ? r.data : null;
}

export const sectionInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  eyebrow: z.string().trim().max(80).optional().nullable(),
  navLabel: z.string().trim().max(40).optional().nullable(),
  background: z.enum(BACKGROUNDS).default("white"),
  backdrop: backdropSchema.nullable().optional(),
  blocks: z.array(blockSchema).max(60).default([]),
  isPublished: z.boolean().optional(),
});
export type SectionInput = z.infer<typeof sectionInputSchema>;

export type LandingSectionDto = {
  id: string;
  title: string;
  eyebrow: string | null;
  navLabel: string | null;
  background: Background;
  backdrop: Backdrop | null;
  blocks: Block[];
  isPublished: boolean;
  updatedAt: string;
};

/** Parse stored JSON leniently: drop blocks that no longer validate. */
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    const r = blockSchema.safeParse(b);
    return r.success ? [r.data] : [];
  });
}

export function toSectionDto(row: {
  id: string; title: string; eyebrow: string | null; navLabel: string | null;
  background: string; backdrop?: unknown; blocks: unknown; isPublished: boolean; updatedAt: Date;
}): LandingSectionDto {
  return {
    id: row.id,
    title: row.title,
    eyebrow: row.eyebrow,
    navLabel: row.navLabel,
    background: (BACKGROUNDS as readonly string[]).includes(row.background) ? (row.background as Background) : "white",
    backdrop: parseBackdrop(row.backdrop),
    blocks: parseBlocks(row.blocks),
    isPublished: row.isPublished,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  images: "Image grid",
  media: "Text + image",
  cards: "Cards",
  stats: "Stats",
  buttons: "Buttons",
  video: "YouTube video",
};

export function newBlock<T extends BlockType>(type: T): BlockOf<T> {
  const id = Math.random().toString(36).slice(2, 10);
  const blank = { url: "", alt: "", caption: "" };
  const byType: { [K in BlockType]: BlockOf<K> } = {
    heading: { id, type: "heading", text: "", level: 3, align: "left" },
    text: { id, type: "text", markdown: "", align: "left" },
    image: { id, type: "image", image: blank, width: "wide" },
    images: { id, type: "images", items: [], columns: 3 },
    media: { id, type: "media", image: blank, markdown: "", side: "left" },
    cards: { id, type: "cards", items: [{ title: "", text: "", image: "", url: "" }], columns: 3 },
    stats: { id, type: "stats", items: [{ value: "", label: "" }] },
    buttons: { id, type: "buttons", items: [{ label: "", url: "", variant: "primary" }], align: "left" },
    video: { id, type: "video", url: "", caption: "" },
  };
  return byType[type] as BlockOf<T>;
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? m[1] : null;
}

// ── Page layout (order of fixed + custom sections) ───────────────────────────

export const LAYOUT_SETTING_KEY = "landing_layout";

/** Fixed sections of the public page that can be moved. Hero and footer stay put. */
export const FIXED_SECTIONS = {
  categories: { label: "Competition categories", description: "Themes and their competitions, with the mapping card." },
  news: { label: "News", description: "Latest published news articles (hidden when there are none)." },
  gallery: { label: "Gallery", description: "Photo galleries (hidden when there are none)." },
} as const;
export type FixedKey = keyof typeof FIXED_SECTIONS;
export const FIXED_KEYS = Object.keys(FIXED_SECTIONS) as FixedKey[];

/** Order entries are "fixed:<key>" or "custom:<id>". */
export type LandingLayout = { order: string[]; hidden: string[] };

export const layoutSchema = z.object({
  order: z.array(z.string().max(80)).max(200),
  hidden: z.array(z.string().max(80)).max(200).default([]),
});

export function parseLayout(raw: string | null | undefined): LandingLayout {
  try {
    const r = layoutSchema.safeParse(JSON.parse(raw ?? ""));
    if (r.success) return r.data;
  } catch { /* fall through */ }
  return { order: [], hidden: [] };
}

/**
 * The full page order: entries saved in the layout first (dropping sections
 * that no longer exist), then any fixed section or custom section not yet
 * placed, in their default order (fixed first, custom sections after).
 */
export function resolveOrder(layout: LandingLayout, customIds: string[]): string[] {
  const known = new Set([...FIXED_KEYS.map((k) => `fixed:${k}`), ...customIds.map((id) => `custom:${id}`)]);
  const out: string[] = [];
  for (const k of layout.order) if (known.has(k) && !out.includes(k)) out.push(k);
  for (const k of known) if (!out.includes(k)) out.push(k);
  return out;
}

/** Roles that may create, edit and reorder sections (same as galleries / news). */
export const LANDING_WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
