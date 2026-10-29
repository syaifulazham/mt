/* eslint-disable @next/next/no-img-element */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { youtubeId, type Backdrop, type Background, type Block, type SectionImage } from "@/lib/landingSections";

// Renders a custom landing page section. Used by the public landing page and by
// the organizer editor's live preview, so it must stay free of server-only code.

type Palette = { bg: string; text: string; muted: string; accent: string; eyebrow: string; card: string; cardBorder: string; cardText: string };

const PALETTES: Record<Background, Palette> = {
  white: { bg: "#ffffff", text: "#111827", muted: "#4b5563", accent: "#003893", eyebrow: "#003893", card: "#ffffff", cardBorder: "#e5e7eb", cardText: "#111827" },
  light: { bg: "#f1f5f9", text: "#111827", muted: "#4b5563", accent: "#003893", eyebrow: "#003893", card: "#ffffff", cardBorder: "#e5e7eb", cardText: "#111827" },
  dark:  { bg: "#0f172a", text: "#ffffff", muted: "rgba(255,255,255,0.72)", accent: "#FFD700", eyebrow: "#FFD700", card: "rgba(255,255,255,0.05)", cardBorder: "rgba(255,255,255,0.12)", cardText: "#ffffff" },
  brand: { bg: "linear-gradient(135deg, #001f5b 0%, #003893 60%, #0b4fb8 100%)", text: "#ffffff", muted: "rgba(255,255,255,0.8)", accent: "#FFD700", eyebrow: "#FFD700", card: "rgba(255,255,255,0.08)", cardBorder: "rgba(255,255,255,0.18)", cardText: "#ffffff" },
};

export const CUSTOM_SECTION_CSS = `
.lp-md { line-height: 1.75; font-size: 1rem; }
.lp-md > *:first-child { margin-top: 0; }
.lp-md > *:last-child { margin-bottom: 0; }
.lp-md p { margin: 0 0 1em; }
.lp-md h2, .lp-md h3, .lp-md h4 { font-family: 'Exo 2', sans-serif; font-weight: 700; margin: 1.2em 0 0.5em; line-height: 1.25; color: var(--lp-text); }
.lp-md h2 { font-size: 1.5rem; } .lp-md h3 { font-size: 1.2rem; } .lp-md h4 { font-size: 1.05rem; }
.lp-md ul, .lp-md ol { margin: 0 0 1em; padding-left: 1.4em; }
.lp-md ul { list-style: disc; } .lp-md ol { list-style: decimal; }
.lp-md li { margin: 0.25em 0; }
.lp-md a { color: var(--lp-accent); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.lp-md strong { color: var(--lp-text); font-weight: 700; }
.lp-md blockquote { margin: 0 0 1em; padding: 0.4em 1em; border-left: 3px solid var(--lp-accent); font-style: italic; }
.lp-md table { border-collapse: collapse; margin: 0 0 1em; width: 100%; font-size: 0.92rem; }
.lp-md th, .lp-md td { border: 1px solid var(--lp-border); padding: 6px 10px; text-align: left; }
.lp-md code { font-size: 0.9em; background: rgba(127,127,127,0.15); padding: 1px 5px; border-radius: 4px; }
.lp-card-link { transition: box-shadow 0.2s, transform 0.2s; }
.lp-card-link:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.12); transform: translateY(-2px); }
.lp-btn { transition: opacity 0.2s, transform 0.2s; }
.lp-btn:hover { opacity: 0.9; transform: translateY(-1px); }
@media (max-width: 720px) { .lp-media { grid-template-columns: 1fr !important; } .lp-media-img { order: 0 !important; } }
`;

function isExternal(url: string) {
  return /^https?:\/\//i.test(url);
}

function Md({ children, align }: { children: string; align?: "left" | "center" }) {
  return (
    <div className="lp-md" style={{ textAlign: align ?? "left" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} {...(href && isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c}</a>
          ),
          img: () => null, // images belong in image blocks
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function Figure({ image, radius = 12, aspect }: { image: SectionImage; radius?: number; aspect?: string }) {
  if (!image.url) return null;
  return (
    <figure style={{ margin: 0 }}>
      <img
        src={image.url}
        alt={image.alt}
        loading="lazy"
        style={{ width: "100%", borderRadius: radius, display: "block", objectFit: "cover", ...(aspect ? { aspectRatio: aspect } : {}) }}
      />
      {image.caption && (
        <figcaption style={{ fontSize: "0.78rem", marginTop: 8, color: "var(--lp-muted)", textAlign: "center" }}>{image.caption}</figcaption>
      )}
    </figure>
  );
}

function grid(columns: number, min: number) {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${min}px, calc((100% - ${(columns - 1) * 20}px) / ${columns}))), 1fr))`,
    gap: 20,
  } as const;
}

function BlockView({ block, p }: { block: Block; p: Palette }) {
  switch (block.type) {
    case "heading": {
      if (!block.text) return null;
      const style = {
        fontFamily: "'Exo 2', sans-serif", fontWeight: 700, color: p.text, textAlign: block.align, lineHeight: 1.25, margin: 0,
        fontSize: block.level === 2 ? "clamp(1.4rem, 2.6vw, 2rem)" : "clamp(1.15rem, 2vw, 1.4rem)",
      } as const;
      return block.level === 2 ? <h3 style={style}>{block.text}</h3> : <h4 style={style}>{block.text}</h4>;
    }
    case "text":
      return block.markdown ? <Md align={block.align}>{block.markdown}</Md> : null;
    case "image": {
      const max = block.width === "full" ? "100%" : block.width === "wide" ? 960 : 640;
      return block.image.url ? <div style={{ maxWidth: max, margin: "0 auto", width: "100%" }}><Figure image={block.image} /></div> : null;
    }
    case "images":
      return block.items.length ? (
        <div style={grid(block.columns, 180)}>
          {block.items.map((img, i) => <Figure key={i} image={img} radius={10} aspect="4/3" />)}
        </div>
      ) : null;
    case "media": {
      const img = block.image.url ? <div className="lp-media-img" style={{ order: block.side === "left" ? 0 : 1 }}><Figure image={block.image} /></div> : null;
      return (
        <div className="lp-media" style={{ display: "grid", gridTemplateColumns: img ? "1fr 1fr" : "1fr", gap: "clamp(20px, 4vw, 48px)", alignItems: "center" }}>
          {img}
          <div style={{ order: block.side === "left" ? 1 : 0 }}>{block.markdown && <Md>{block.markdown}</Md>}</div>
        </div>
      );
    }
    case "cards":
      return block.items.length ? (
        <div style={grid(block.columns, 220)}>
          {block.items.map((c, i) => {
            const inner = (
              <div style={{ background: p.card, border: `1px solid ${p.cardBorder}`, borderRadius: 12, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                {c.image && <img src={c.image} alt={c.title} loading="lazy" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />}
                <div style={{ padding: "18px 20px" }}>
                  {c.title && <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1.02rem", color: p.cardText, marginBottom: 6 }}>{c.title}</div>}
                  {c.text && <div style={{ fontSize: "0.86rem", lineHeight: 1.6, color: p.muted, whiteSpace: "pre-line" }}>{c.text}</div>}
                </div>
              </div>
            );
            return c.url ? (
              <a key={i} href={c.url} className="lp-card-link" style={{ textDecoration: "none", color: "inherit", display: "block", borderRadius: 12 }}
                {...(isExternal(c.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{inner}</a>
            ) : <div key={i}>{inner}</div>;
          })}
        </div>
      ) : null;
    case "stats":
      return block.items.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          {block.items.map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "20px 12px", borderRadius: 12, background: p.card, border: `1px solid ${p.cardBorder}` }}>
              <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", color: p.accent, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "0.78rem", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 8, color: p.muted, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      ) : null;
    case "buttons": {
      const items = block.items.filter((b) => b.label && b.url);
      return items.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: block.align === "center" ? "center" : "flex-start" }}>
          {items.map((b, i) => (
            <a key={i} href={b.url} className="lp-btn"
              {...(isExternal(b.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              style={{
                display: "inline-block", padding: "12px 28px", borderRadius: 999, fontWeight: 700, fontSize: "0.82rem",
                letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none",
                ...(b.variant === "primary"
                  ? { background: "#CC0001", color: "#fff", boxShadow: "0 4px 16px rgba(204,0,1,0.3)" }
                  : { background: "transparent", color: p.text, border: `1.5px solid ${p.cardBorder === "#e5e7eb" ? "#cbd5e1" : "rgba(255,255,255,0.4)"}` }),
              }}>
              {b.label}
            </a>
          ))}
        </div>
      ) : null;
    }
    case "video": {
      const id = youtubeId(block.url);
      if (!id) return null;
      return (
        <figure style={{ margin: "0 auto", maxWidth: 960, width: "100%" }}>
          <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "#000" }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}`}
              title={block.caption || "Video"}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
          {block.caption && <figcaption style={{ fontSize: "0.78rem", marginTop: 8, color: p.muted, textAlign: "center" }}>{block.caption}</figcaption>}
        </figure>
      );
    }
  }
}

/** Text colours chosen explicitly for an image / fill backdrop. */
const TEXT_TONE: Record<"light" | "dark", Omit<Palette, "bg">> = {
  light: { text: "#ffffff", muted: "rgba(255,255,255,0.85)", accent: "#FFD700", eyebrow: "#FFD700", card: "rgba(255,255,255,0.10)", cardBorder: "rgba(255,255,255,0.22)", cardText: "#ffffff" },
  dark:  { text: "#111827", muted: "#374151", accent: "#003893", eyebrow: "#003893", card: "rgba(255,255,255,0.85)", cardBorder: "rgba(0,0,0,0.08)", cardText: "#111827" },
};

export function backdropFill(b: Backdrop): string | null {
  if (b.fill === "solid") return b.color;
  if (b.fill === "gradient") return `linear-gradient(${b.angle}deg, ${b.color} 0%, ${b.color2} 100%)`;
  return null;
}

export function CustomSection({ id, title, eyebrow, background, backdrop, blocks }: {
  id: string;
  title: string;
  eyebrow: string | null;
  background: Background;
  backdrop?: Backdrop | null;
  blocks: Block[];
}) {
  const base = PALETTES[background] ?? PALETTES.white;
  const p: Palette = backdrop && backdrop.text !== "auto" ? { ...TEXT_TONE[backdrop.text], bg: base.bg } : base;
  const fill = backdrop ? backdropFill(backdrop) : null;
  return (
    <section
      id={`s-${id}`}
      style={{
        position: "relative", overflow: "hidden", isolation: "isolate",
        background: p.bg, color: p.muted, padding: "clamp(48px,8vw,96px) 0", scrollMarginTop: 64,
        ["--lp-text" as string]: p.text, ["--lp-muted" as string]: p.muted,
        ["--lp-accent" as string]: p.accent, ["--lp-border" as string]: p.cardBorder,
      }}
    >
      {backdrop?.image && (
        <div aria-hidden style={{
          position: "absolute", inset: 0, zIndex: -2,
          backgroundImage: `url(${JSON.stringify(backdrop.image)})`,
          backgroundSize: "cover", backgroundPosition: `center ${backdrop.position}`,
          backgroundAttachment: backdrop.parallax ? "fixed" : "scroll",
        }} />
      )}
      {fill && (
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: fill, opacity: backdrop!.opacity / 100 }} />
      )}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,5vw,40px)" }}>
        {eyebrow && (
          <p style={{ fontSize: "0.7rem", letterSpacing: "0.35em", textTransform: "uppercase", color: p.eyebrow, marginBottom: 10, fontWeight: 700 }}>
            {eyebrow}
          </p>
        )}
        <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.6rem)", textTransform: "uppercase", color: p.text, marginBottom: blocks.length ? 40 : 0, lineHeight: 1.15 }}>
          {title}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {blocks.map((b) => <BlockView key={b.id} block={b} p={p} />)}
        </div>
      </div>
    </section>
  );
}
