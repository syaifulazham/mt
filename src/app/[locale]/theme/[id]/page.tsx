import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PublicNav } from "@/components/landing/PublicNav";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";

const LEVEL_PILL: Record<string, { label: string; bg: string; color: string }> = {
  KINDERGARTEN: { label: "Prasekolah", bg: "#fce7f3", color: "#be185d" },
  PRIMARY:      { label: "Rendah",     bg: "#d1fae5", color: "#065f46" },
  SECONDARY:    { label: "Menengah",   bg: "#dbeafe", color: "#1e40af" },
  YOUTH:        { label: "Belia",      bg: "#ffedd5", color: "#9a3412" },
  HIGHER:       { label: "Tinggi",     bg: "#ede9fe", color: "#5b21b6" },
};

function levelPill(schoolLevel: string) {
  const k = schoolLevel.toUpperCase();
  if (k.includes("KINDERGARTEN") || k.includes("TADIKA")) return LEVEL_PILL.KINDERGARTEN;
  if (k.includes("PRIMARY")   || k.includes("RENDAH"))    return LEVEL_PILL.PRIMARY;
  if (k.includes("SECONDARY") || k.includes("MENENGAH"))  return LEVEL_PILL.SECONDARY;
  if (k.includes("YOUTH") || k.includes("BELIA") || k.includes("TERBUKA")) return LEVEL_PILL.YOUTH;
  if (k.includes("HIGHER") || k.includes("UNIVERSITY"))   return LEVEL_PILL.HIGHER;
  return LEVEL_PILL.PRIMARY;
}

export default async function ThemePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const theme = await db.theme.findUnique({
    where: { id },
    include: {
      competitions: {
        orderBy: { code: "asc" },
        include: {
          targetGroups: { include: { targetGroup: true }, take: 1 },
        },
      },
    },
  });

  if (!theme) notFound();

  const accent = theme.color ?? "#003893";

  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Inter', sans-serif; background: #f8fafc; }
        .comp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 24px; display: flex; align-items: flex-start; gap: 16px; text-decoration: none; transition: box-shadow 0.2s, transform 0.2s; }
        .comp-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.09); transform: translateY(-2px); }
      `}</style>

      <PublicNav locale={locale} />

      <div style={{ paddingTop: 64 }}>
        {/* Hero */}
        <div style={{ background: accent, padding: "64px 40px 48px", position: "relative", overflow: "hidden" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.75)", textDecoration: "none", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 24 }}>
              Laman Utama <ChevronRight size={12} />
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
              {theme.logoUrl && (
                (theme.logoUrl.startsWith("/") || theme.logoUrl.startsWith("http://") || theme.logoUrl.startsWith("https://"))
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={theme.logoUrl} alt={theme.name} style={{ width: 64, height: 64, objectFit: "contain", filter: "brightness(0) invert(1) drop-shadow(0 2px 6px rgba(0,0,0,0.3))", flexShrink: 0 }} />
                  : <span style={{ fontSize: "3rem", lineHeight: 1, flexShrink: 0 }}>{theme.logoUrl}</span>
              )}
              <h1 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.8rem, 4vw, 3rem)", textTransform: "uppercase", color: "#fff", margin: 0, lineHeight: 1.1 }}>
                {theme.name}
              </h1>
            </div>
            {theme.description && (
              <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.7, maxWidth: 700, margin: 0 }}>
                {theme.description}
              </p>
            )}
          </div>
        </div>

        {/* Competitions */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 40px" }}>
          <p style={{ fontSize: "0.7rem", letterSpacing: "0.35em", textTransform: "uppercase", color: accent, marginBottom: 10, fontWeight: 700 }}>
            Pertandingan
          </p>
          <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.4rem, 2.5vw, 2rem)", textTransform: "uppercase", color: "#111827", marginBottom: 32, lineHeight: 1.2 }}>
            {theme.competitions.length} Pertandingan dalam tema ini
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {theme.competitions.map((comp) => {
              const tg = comp.targetGroups[0]?.targetGroup;
              const pill = tg ? levelPill(tg.schoolLevel) : LEVEL_PILL.PRIMARY;
              return (
                <Link key={comp.id} href={`/competition/${comp.id}`} className="comp-card">
                  <span style={{ flexShrink: 0, fontSize: "0.68rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: pill.bg, color: pill.color, marginTop: 2, whiteSpace: "nowrap" }}>
                    {pill.label}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#111827", marginBottom: 2 }}>
                      <span style={{ color: "#9ca3af", marginRight: 8, fontWeight: 600 }}>{comp.code}</span>
                      {comp.name}
                    </p>
                    {comp.description && (
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280", lineHeight: 1.55, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {comp.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} style={{ color: "#d1d5db", flexShrink: 0, marginTop: 2 }} />
                </Link>
              );
            })}

            {theme.competitions.length === 0 && (
              <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>Tiada pertandingan buat masa ini.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
