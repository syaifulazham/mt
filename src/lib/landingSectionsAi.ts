import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/db";
import { BACKGROUNDS, parseBlocks, type Background, type Block } from "@/lib/landingSections";

// AI helper for custom landing page sections (Gemini, same key as the other
// organizer AI tools). Returns a draft for the editor; nothing is saved here.

const BLOCK_GUIDE = `Blocks (JSON objects, each with a "type"):
- {"type":"heading","text":"...","level":2|3,"align":"left"|"center"}
- {"type":"text","markdown":"...","align":"left"|"center"}   (Markdown: **bold**, *italic*, lists, [links](https://...))
- {"type":"image","image":{"url":"...","alt":"...","caption":"..."},"width":"full"|"wide"|"medium"}
- {"type":"images","items":[{"url":"...","alt":"...","caption":""}],"columns":2|3|4}
- {"type":"media","image":{"url":"...","alt":"...","caption":""},"markdown":"...","side":"left"|"right"}
- {"type":"cards","items":[{"title":"...","text":"...","image":"","url":""}],"columns":2|3|4}
- {"type":"stats","items":[{"value":"171k","label":"..."}]}
- {"type":"buttons","items":[{"label":"...","url":"https://... or /path or #anchor","variant":"primary"|"secondary"}],"align":"left"|"center"}
- {"type":"video","url":"https://www.youtube.com/watch?v=...","caption":""}`;

export type GeneratedSection = { title: string; eyebrow: string; background: Background; blocks: Block[] };

export async function generateSection({ apiKey, prompt, language, useGallery, current }: {
  apiKey: string;
  prompt: string;
  language: "ms" | "en";
  useGallery: boolean;
  current?: { title: string; blocks: unknown[] };
}): Promise<GeneratedSection> {
  // Photos the AI may use — it must pick from these, never invent URLs.
  const photos = useGallery
    ? await db.galleryPhoto.findMany({
        where: { OR: [{ fullUrl: { startsWith: "https://" } }, { thumbUrl: { startsWith: "https://" } }] },
        select: { thumbUrl: true, fullUrl: true, description: true, gallery: { select: { title: true, year: true } } },
        orderBy: [{ gallery: { year: "desc" } }, { order: "asc" }],
        take: 80,
      })
    : [];
  const photoList = photos.map((p) => ({
    url: p.fullUrl.startsWith("https://") ? p.fullUrl : p.thumbUrl,
    gallery: `${p.gallery.title} (${p.gallery.year})`,
    description: p.description ?? "",
  }));
  const allowed = new Set(photoList.map((p) => p.url));

  const themes = await db.theme.findMany({ select: { name: true }, orderBy: { name: "asc" } }).catch(() => []);

  const instruction = `You write content for a section of the public landing page of Malaysia Techlympics 2026, the national technology competition for school students and youth organised by the Ministry of Science, Technology and Innovation (MOSTI).
Competition themes: ${themes.map((t) => t.name).join(", ") || "(not listed)"}.

Write in ${language === "ms" ? "Bahasa Malaysia" : "English"}. Keep it concise, factual and suitable for students, parents and teachers. Do not invent dates, prize amounts, statistics or contact details the organiser did not give; leave such things out instead.

${current ? `Revise the existing section below according to the request. Keep what the request does not ask to change.
Existing section: ${JSON.stringify({ title: current.title, blocks: current.blocks })}
` : ""}Request from the organiser: """${prompt}"""

${BLOCK_GUIDE}

Images: ${photoList.length
    ? `use ONLY urls from this list (choose ones whose gallery/description fit), or leave "url" empty:\n${JSON.stringify(photoList)}`
    : `no photos are available — leave every image "url" empty.`}

Return ONLY JSON of this shape:
{"title":"...","eyebrow":"short label above the title (1-3 words)","background":"white"|"light"|"dark"|"brand","blocks":[ ... ]}
Use 2-6 blocks. Do not repeat the title as a heading block.`;

  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
  });
  const result = await model.generateContent(instruction);
  const raw = JSON.parse(result.response.text()) as Record<string, unknown>;

  const withIds = (Array.isArray(raw.blocks) ? raw.blocks : []).map((b) => ({
    ...(b as object),
    id: Math.random().toString(36).slice(2, 10),
  }));
  return {
    title: typeof raw.title === "string" ? raw.title.slice(0, 200) : "",
    eyebrow: typeof raw.eyebrow === "string" ? raw.eyebrow.slice(0, 80) : "",
    background: (BACKGROUNDS as readonly string[]).includes(raw.background as string) ? (raw.background as Background) : "white",
    blocks: parseBlocks(withIds).map((b) => stripUnknownImages(b, allowed)),
  };
}

/** Blank out any image URL the model made up. */
function stripUnknownImages(b: Block, allowed: Set<string>): Block {
  const ok = (u: string) => (u && allowed.has(u) ? u : "");
  switch (b.type) {
    case "image": return { ...b, image: { ...b.image, url: ok(b.image.url) } };
    case "media": return { ...b, image: { ...b.image, url: ok(b.image.url) } };
    case "images": return { ...b, items: b.items.filter((i) => allowed.has(i.url)) };
    case "cards": return { ...b, items: b.items.map((i) => ({ ...i, image: ok(i.image) })) };
    default: return b;
  }
}
