import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PublicNav } from "@/components/landing/PublicNav";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight, FileText, Download, Users, Calendar, MapPin } from "lucide-react";

const LEVEL_PILL: Record<string, { bg: string; color: string }> = {
  KINDERGARTEN: { bg: "#fce7f3", color: "#be185d" },
  PRIMARY:      { bg: "#d1fae5", color: "#065f46" },
  SECONDARY:    { bg: "#dbeafe", color: "#1e40af" },
  YOUTH:        { bg: "#ffedd5", color: "#9a3412" },
  HIGHER:       { bg: "#ede9fe", color: "#5b21b6" },
};

type LevelKey = "KINDERGARTEN" | "PRIMARY" | "SECONDARY" | "YOUTH" | "HIGHER";

function levelKey(schoolLevel: string): LevelKey {
  const k = schoolLevel.toUpperCase();
  if (k.includes("KINDERGARTEN") || k.includes("TADIKA")) return "KINDERGARTEN";
  if (k.includes("PRIMARY")   || k.includes("RENDAH"))    return "PRIMARY";
  if (k.includes("SECONDARY") || k.includes("MENENGAH"))  return "SECONDARY";
  if (k.includes("YOUTH") || k.includes("BELIA") || k.includes("TERBUKA")) return "YOUTH";
  if (k.includes("HIGHER") || k.includes("UNIVERSITY"))   return "HIGHER";
  return "PRIMARY";
}

function fmt(d: Date | null | undefined, locale: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

const LEVEL_LABEL: Record<LevelKey, string> = {
  KINDERGARTEN: "Prasekolah",
  PRIMARY:      "Rendah",
  SECONDARY:    "Menengah",
  YOUTH:        "Belia",
  HIGHER:       "Tinggi",
};

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const [competition, t] = await Promise.all([
    db.competition.findUnique({
      where: { id },
      include: {
        theme: true,
        targetGroups: { include: { targetGroup: true } },
        docs: { orderBy: { uploadedAt: "desc" } },
      },
    }),
    getTranslations({ locale, namespace: "competition" }),
  ]);

  if (!competition) notFound();

  const tg = competition.targetGroups[0]?.targetGroup;
  const key = tg ? levelKey(tg.schoolLevel) : "PRIMARY";
  const pill = LEVEL_PILL[key];
  const pillLabel = LEVEL_LABEL[key];
  const accent = competition.theme?.color ?? "#003893";

  const { minTeamSize: min, maxTeamSize: max } = competition;
  const participationLabel =
    competition.participationType !== "TEAM" || (min === 1 && max === 1)
      ? t("individual")
      : min === max
      ? t("teamFixed", { count: min })
      : t("teamRange", { min, max });

  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Inter', sans-serif; background: #f8fafc; }
        .doc-row { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; text-decoration: none; transition: box-shadow 0.2s, transform 0.2s; }
        .doc-row:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); transform: translateY(-1px); }
        .info-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
        .info-row:last-child { border-bottom: none; }
      `}</style>

      <PublicNav locale={locale} />

      <div style={{ paddingTop: 64 }}>
        {/* Hero */}
        <div style={{ background: accent, padding: "56px 40px 44px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
              <Link href="/" style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {t("breadcrumbHome")}
              </Link>
              {competition.theme && (
                <>
                  <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.5)" }} />
                  <Link href={`/theme/${competition.theme.id}`} style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {competition.theme.name}
                  </Link>
                </>
              )}
              <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {competition.code}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: pill.bg, color: pill.color, whiteSpace: "nowrap" }}>
                {pillLabel}
              </span>
              <span style={{ fontSize: "0.68rem", fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,0.18)", color: "#fff", letterSpacing: "0.06em" }}>
                {competition.code}
              </span>
            </div>

            <h1 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3.5vw, 2.6rem)", textTransform: "uppercase", color: "#fff", margin: "0 0 12px", lineHeight: 1.15 }}>
              {competition.name}
            </h1>

            {competition.description && (
              <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.7, maxWidth: 720, margin: 0 }}>
                {competition.description}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px", display: "grid", gridTemplateColumns: "1fr minmax(280px, 320px)", gap: 40, alignItems: "start" }}>

          {/* Left: Details + Docs */}
          <div>
            {/* Competition details */}
            <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "24px 28px", marginBottom: 28 }}>
              <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", margin: "0 0 16px" }}>
                {t("details")}
              </h2>

              <div>
                {tg && (
                  <div className="info-row">
                    <Users size={16} style={{ color: "#9ca3af", marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{t("targetGroup")}</p>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: "#111827", fontWeight: 600 }}>
                        {competition.targetGroups.map((cg) => cg.targetGroup.name).join(", ")}
                      </p>
                    </div>
                  </div>
                )}

                <div className="info-row">
                  <Users size={16} style={{ color: "#9ca3af", marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{t("participationType")}</p>
                    <p style={{ margin: 0, fontSize: "0.88rem", color: "#111827", fontWeight: 600 }}>{participationLabel}</p>
                  </div>
                </div>

                {competition.venue && (
                  <div className="info-row">
                    <MapPin size={16} style={{ color: "#9ca3af", marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{t("venue")}</p>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: "#111827", fontWeight: 600 }}>{competition.venue}</p>
                      {competition.address && <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#6b7280" }}>{competition.address}</p>}
                    </div>
                  </div>
                )}

                {(competition.startDate || competition.endDate) && (
                  <div className="info-row">
                    <Calendar size={16} style={{ color: "#9ca3af", marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{t("date")}</p>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: "#111827", fontWeight: 600 }}>
                        {fmt(competition.startDate, locale)}{competition.endDate && competition.endDate !== competition.startDate ? ` – ${fmt(competition.endDate, locale)}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {(competition.registrationStart || competition.registrationEnd) && (
                  <div className="info-row">
                    <Calendar size={16} style={{ color: "#9ca3af", marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{t("registration")}</p>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: "#111827", fontWeight: 600 }}>
                        {fmt(competition.registrationStart, locale)}{competition.registrationEnd ? ` – ${fmt(competition.registrationEnd, locale)}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Concept papers */}
            {competition.docs.length > 0 && (
              <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "24px 28px" }}>
                <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", margin: "0 0 16px" }}>
                  {t("documents")}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {competition.docs.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/competition/${competition.id}/docs/${doc.id}`}
                      className="doc-row"
                    >
                      <FileText size={20} style={{ color: "#CC0001", flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: "0.88rem", color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.name}
                      </span>
                      <Download size={16} style={{ color: "#9ca3af", flexShrink: 0 }} />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right: Theme card */}
          {competition.theme && (
            <aside>
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ height: 5, background: accent }} />
                <div style={{ padding: "20px 22px" }}>
                  <p style={{ fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9ca3af", margin: "0 0 6px", fontWeight: 700 }}>{t("themeLabel")}</p>
                  <p style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "1rem", textTransform: "uppercase", color: "#111827", margin: "0 0 10px" }}>
                    {competition.theme.name}
                  </p>
                  {competition.theme.description && (
                    <p style={{ fontSize: "0.8rem", color: "#6b7280", lineHeight: 1.6, margin: "0 0 14px" }}>
                      {competition.theme.description}
                    </p>
                  )}
                  <Link
                    href={`/theme/${competition.theme.id}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: accent, textDecoration: "none", letterSpacing: "0.04em", textTransform: "uppercase" }}
                  >
                    {t("seeAll")} <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
