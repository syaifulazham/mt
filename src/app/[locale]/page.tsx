import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { HeroCarousel } from "@/components/landing/HeroCarousel";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Images, ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Malaysia Techlympics 2026",
  description: "Malaysia's premier technology olympiad — empowering the next generation of innovators, engineers, and digital creators.",
};

function renderThemeIcon(logoUrl: string | null, name: string) {
  if (!logoUrl) {
    return (
      <span className="text-3xl mb-4 block">{name.charAt(0)}</span>
    );
  }
  if (logoUrl.startsWith("/uploads/") || logoUrl.startsWith("https://") || logoUrl.startsWith("http://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={name} className="w-10 h-10 object-contain mb-4" />
    );
  }
  return <span className="text-3xl mb-4 block">{logoUrl}</span>;
}

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

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const { userId } = await auth().catch(() => ({ userId: null }));
  const [manager, themes, galleries, newsArticles, t] = await Promise.all([
    userId
      ? db.managerProfile.findUnique({
          where: { clerkUserId: userId },
          select: { name: true, profileComplete: true },
        })
      : Promise.resolve(null),
    db.theme.findMany({
      orderBy: { name: "asc" },
      include: {
        competitions: {
          orderBy: { code: "asc" },
          take: 5,
          include: {
            targetGroups: { include: { targetGroup: true }, take: 1 },
          },
        },
        _count: { select: { competitions: true } },
      },
    }),
    db.gallery.findMany({
      orderBy: { year: "desc" },
      include: {
        photos: { orderBy: { order: "asc" }, take: 1 },
        _count: { select: { photos: true } },
      },
    }),
    db.newsArticle.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      take: 6,
    }),
    getTranslations({ locale, namespace: "landing" }),
  ]);

  const clerkUser = userId && !manager ? await currentUser() : null;
  const clerkDisplayName =
    clerkUser?.firstName ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
    null;

  // ── Carousel images: up to 5 random photos from all galleries ────────────────
  const galleryPhotos = await db.galleryPhoto.findMany({
    select: { thumbUrl: true },
    where: { thumbUrl: { startsWith: "https://" } },
  });
  // eslint-disable-next-line react-hooks/purity
  const shuffled = [...galleryPhotos].sort(() => Math.random() - 0.5).slice(0, 5);
  const carouselImages = shuffled.map((p) => p.thumbUrl);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700;900&family=Rajdhani:wght@400;600;700&display=swap');

        * { box-sizing: border-box; }

        .nav-link {
          position: relative;
          color: #374151;
          text-decoration: none;
          font-size: 0.82rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: color 0.2s;
          padding-bottom: 2px;
          font-family: 'Rajdhani', sans-serif;
          font-weight: 600;
        }
        .nav-link:hover { color: #003893; }
        .nav-link::after {
          content: '';
          position: absolute; bottom: 0; left: 0;
          width: 0; height: 2px;
          background: #003893;
          transition: width 0.25s ease;
        }
        .nav-link:hover::after { width: 100%; }

        .theme-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 28px 24px;
          transition: box-shadow 0.25s, border-color 0.25s, transform 0.25s;
          position: relative;
          overflow: hidden;
        }
        .theme-card:hover {
          box-shadow: 0 8px 32px rgba(0,56,147,0.12);
          border-color: #93c5fd;
          transform: translateY(-2px);
        }
        .theme-card-bar {
          position: absolute; top: 0; left: 0;
          width: 4px; height: 0;
          transition: height 0.35s;
        }
        .theme-card:hover .theme-card-bar { height: 100%; }
        .comp-link:hover { background: #f0f4ff !important; border-color: #c7d7fc !important; }

        .gallery-card {
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
          transition: box-shadow 0.25s, transform 0.25s;
        }
        .gallery-card:hover {
          box-shadow: 0 8px 24px rgba(0,0,0,0.10);
          transform: translateY(-3px);
        }

        .mapping-feat-card:hover {
          box-shadow: 0 8px 40px rgba(255,215,0,0.18), 0 2px 16px rgba(0,0,0,0.4);
          border-color: rgba(255,215,0,0.55) !important;
          transform: translateY(-2px);
        }
        .news-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.09);
          transform: translateY(-2px);
        }
        .social-btn:hover {
          background: rgba(255,255,255,0.15) !important;
          border-color: rgba(255,215,0,0.4) !important;
          transform: translateY(-2px);
        }
        .social-btn:hover svg { opacity: 1; }
        .footer-link:hover { color: rgba(255,255,255,0.8) !important; }

        @keyframes fadein {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-content { animation: fadein 0.8s ease both; }
      `}</style>

      <div style={{ fontFamily: "'Rajdhani', sans-serif", background: "#f8fafc", color: "#111827", minHeight: "100vh", overflowX: "hidden" }}>

        {/* ── NAV ─────────────────────────────────────────────────────────────── */}
        <nav
          className="fixed top-0 left-0 right-0 flex justify-between items-center z-50 px-8 md:px-16"
          style={{
            height: 64,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(0,0,0,0.07)",
            boxShadow: "0 1px 16px rgba(0,0,0,0.06)",
          }}
        >
          <Link href="/" className="flex items-center">
            <Image
              src="/logo-mt.svg"
              alt="Malaysia Techlympics 2026"
              width={140}
              height={80}
              priority
              style={{ height: 38, width: "auto" }}
            />
          </Link>

          <ul className="hidden md:flex gap-8 list-none m-0 p-0">
            <li><a href="#categories" className="nav-link">{t("navCompetition")}</a></li>
            <li><a href="#news" className="nav-link">{t("navNews")}</a></li>
            <li><a href="#announcements" className="nav-link">{t("navAnnouncements")}</a></li>
            <li><a href="#gallery" className="nav-link">{t("navGallery")}</a></li>
          </ul>

          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <Link href="/organizer/login" className="text-xs text-slate-400 hover:text-slate-700 transition-colors" style={{ letterSpacing: "0.08em" }}>
              {t("staffLogin")}
            </Link>

            {manager ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 hidden lg:block max-w-[140px] truncate">{manager.name}</span>
                <Link href="/manager/dashboard">
                  <button
                    className="text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full transition-all"
                    style={{ background: "#003893", color: "#fff", letterSpacing: "0.12em" }}
                  >
                    {t("dashboardButton")}
                  </button>
                </Link>
              </div>
            ) : userId ? (
              <div className="flex items-center gap-3">
                {clerkDisplayName && (
                  <span className="text-xs text-slate-500 hidden lg:block">{clerkDisplayName}</span>
                )}
                <Link href="/manager/onboarding">
                  <button
                    className="text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full"
                    style={{ background: "#16a34a", color: "#fff" }}
                  >
                    Lengkapkan Profil
                  </button>
                </Link>
              </div>
            ) : (
              <Link href="/manager/sign-up">
                <button
                  className="text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full transition-all hover:opacity-90"
                  style={{ background: "#CC0001", color: "#fff", letterSpacing: "0.12em" }}
                >
                  {t("registerNow")}
                </button>
              </Link>
            )}
          </div>
        </nav>

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <section className="relative flex flex-col items-center justify-center text-center" style={{ minHeight: "100vh", paddingTop: 64 }}>

          {/* Background carousel or gradient fallback */}
          {carouselImages.length > 0 ? (
            <HeroCarousel images={carouselImages} />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, #001f5b 0%, #003893 40%, #CC0001 100%)" }}
            />
          )}

          {/* Hero content */}
          <div className="relative z-10 hero-content flex flex-col items-center" style={{ padding: "0 24px", maxWidth: 720 }}>

            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 mb-8 rounded-full px-5 py-2"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#fff" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              {t("registrationOpen")}
            </div>

            {/* Logo — white edge glow so original colours stand out on dark carousel */}
            <div className="mb-6" style={{ width: "clamp(200px, 30vw, 300px)" }}>
              <Image
                src="/logo-mt.svg"
                alt="Malaysia Techlympics 2026"
                width={280}
                height={160}
                priority
                style={{
                  width: "100%",
                  height: "auto",
                  filter: [
                    "drop-shadow(2px  0px 0 #fff)",
                    "drop-shadow(-2px 0px 0 #fff)",
                    "drop-shadow(0px  2px 0 #fff)",
                    "drop-shadow(0px -2px 0 #fff)",
                    "drop-shadow(0 0 12px rgba(255,255,255,0.6))",
                  ].join(" "),
                }}
              />
            </div>

            {/* Ministry label */}
            <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.75rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "#FFD700", marginBottom: 12 }}>
              {t("ministry")}
            </p>

            {/* Main title */}
            <h1 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.02em", textTransform: "uppercase", marginBottom: 8 }}>
              <span className="block text-white" style={{ fontSize: "clamp(2.8rem, 7vw, 6.5rem)" }}>Malaysia</span>
              <span
                className="block"
                style={{
                  fontSize: "clamp(2.8rem, 7vw, 6.5rem)",
                  background: "linear-gradient(135deg, #CC0001 0%, #FFD700 50%, #CC0001 100%)",
                  backgroundSize: "200%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Techlympics
              </span>
              <span className="block text-white/90" style={{ fontSize: "clamp(1.6rem, 4vw, 3.5rem)", letterSpacing: "0.3em" }}>
                2026
              </span>
            </h1>

            <p className="mt-6 text-white/75" style={{ maxWidth: 520, fontSize: "1rem", lineHeight: 1.75 }}>
              {t.rich("heroParagraph", {
                highlight: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
              })}
            </p>

            {/* CTAs */}
            <div className="flex gap-4 mt-10 flex-wrap justify-center">
              {manager ? (
                <Link href="/manager/dashboard">
                  <button className="px-8 py-3.5 rounded-full font-bold text-sm tracking-widest uppercase transition-all hover:opacity-90"
                    style={{ background: "#003893", color: "#fff", boxShadow: "0 4px 20px rgba(0,56,147,0.4)" }}>
                    {t("goToDashboard")}
                  </button>
                </Link>
              ) : userId ? (
                <Link href="/manager/onboarding">
                  <button className="px-8 py-3.5 rounded-full font-bold text-sm tracking-widest uppercase transition-all hover:opacity-90"
                    style={{ background: "#CC0001", color: "#fff", boxShadow: "0 4px 20px rgba(204,0,1,0.4)" }}>
                    {t("registerNow")}
                  </button>
                </Link>
              ) : (
                <Link href="/manager/sign-up">
                  <button className="px-8 py-3.5 rounded-full font-bold text-sm tracking-widest uppercase transition-all hover:opacity-90"
                    style={{ background: "#CC0001", color: "#fff", boxShadow: "0 4px 20px rgba(204,0,1,0.4)" }}>
                    {t("registerNow")}
                  </button>
                </Link>
              )}
              <a href="#categories">
                <button
                  className="px-8 py-3.5 rounded-full font-bold text-sm tracking-widest uppercase transition-all"
                  style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff" }}
                >
                  {t("exploreCategories")}
                </button>
              </a>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/50">
            <span className="text-[10px] tracking-widest uppercase">Scroll</span>
            <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
          </div>
        </section>

        {/* ── CATEGORIES ──────────────────────────────────────────────────────── */}
        <section id="categories" style={{ background: "#f8fafc", padding: "96px 0" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px" }}>
            <p style={{ fontSize: "0.7rem", letterSpacing: "0.35em", textTransform: "uppercase", color: "#003893", marginBottom: 10, fontWeight: 700 }}>
              {t("competitionTracksLabel")}
            </p>
            <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.6rem)", textTransform: "uppercase", color: "#111827", marginBottom: 48, lineHeight: 1.15 }}>
              {t.rich("tagline", {
                golden: (chunks) => <span style={{ color: "#003893" }}>{chunks}</span>,
              })}
              <br />
              <span style={{ color: "#CC0001" }}>{t("tagline2")}</span>
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
              {/* ── Competition Mapping featured card ── */}
              <Link
                href="/mapping"
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f2044 100%)",
                    border: "1px solid rgba(255,215,0,0.25)",
                    borderRadius: 12,
                    padding: "28px 24px",
                    position: "relative",
                    overflow: "hidden",
                    cursor: "pointer",
                    transition: "box-shadow 0.25s, border-color 0.25s, transform 0.25s",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  className="mapping-feat-card"
                >
                  {/* Background dot grid */}
                  <div style={{
                    position: "absolute", inset: 0, opacity: 0.06,
                    backgroundImage: "radial-gradient(circle, #FFD700 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }} />
                  {/* Gold accent bar */}
                  <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: "linear-gradient(90deg, #FFD700, #f59e0b, #FFD700)" }} />

                  <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
                    {/* Icon */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                      </div>
                    </div>

                    <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#FFD700", marginBottom: 6 }}>
                      Peta Pertandingan
                    </div>
                    <div style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "rgba(255,255,255,0.6)", marginBottom: 20, flex: 1 }}>
                      Laluan lengkap menuju peringkat kebangsaan — terokai semua kluster, pertandingan, dan kategori penyertaan rasmi Techlympics 2026.
                    </div>

                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 700, color: "#FFD700", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "auto" }}>
                      Lihat Peta Penuh
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              </Link>

              {themes.map((c) => {
                const accent = c.color ?? "#003893";
                return (
                  <div key={c.id} className="theme-card">
                    <div className="theme-card-bar" style={{ background: accent }} />
                    {renderThemeIcon(c.logoUrl, c.name)}
                    <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#111827", marginBottom: 6 }}>
                      {c.name}
                    </div>
                    {c.description && (
                      <div style={{ fontSize: "0.78rem", lineHeight: 1.55, color: "#6b7280", marginBottom: 14 }}>
                        {c.description}
                      </div>
                    )}

                    {/* Competition list */}
                    {c.competitions.length > 0 && (
                      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {c.competitions.map((comp) => {
                          const tg = comp.targetGroups[0]?.targetGroup;
                          const pill = tg ? levelPill(tg.schoolLevel) : LEVEL_PILL.PRIMARY;
                          return (
                            <li key={comp.id}>
                              <Link
                                href={`/competition/${comp.id}`}
                                style={{ display: "flex", alignItems: "flex-start", gap: 8, textDecoration: "none", padding: "6px 8px", borderRadius: 6, background: "#f9fafb", border: "1px solid #f3f4f6", transition: "background 0.15s" }}
                                className="comp-link"
                              >
                                <span style={{ flexShrink: 0, fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: pill.bg, color: pill.color, marginTop: 1, whiteSpace: "nowrap" }}>
                                  {pill.label}
                                </span>
                                <span style={{ fontSize: "0.78rem", color: "#374151", lineHeight: 1.4, fontWeight: 500 }}>
                                  <span style={{ color: "#9ca3af", marginRight: 4, fontWeight: 600 }}>{comp.code}</span>
                                  {comp.name}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* See more */}
                    <Link
                      href={`/theme/${c.id}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: accent, textDecoration: "none", letterSpacing: "0.04em", textTransform: "uppercase", marginTop: "auto" }}
                    >
                      {c._count.competitions > 5 ? `+${c._count.competitions - 5} lagi · ` : ""}Lihat Selanjutnya <ChevronRight size={14} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── NEWS ────────────────────────────────────────────────────────────── */}
        {newsArticles.length > 0 && (
          <section id="news" style={{ background: "#f1f5f9", padding: "96px 0" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px" }}>
              <p style={{ fontSize: "0.7rem", letterSpacing: "0.35em", textTransform: "uppercase", color: "#003893", marginBottom: 10, fontWeight: 700 }}>
                {t("navNews")}
              </p>
              <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.6rem)", textTransform: "uppercase", color: "#111827", marginBottom: 48, lineHeight: 1.15 }}>
                Berita <span style={{ color: "#003893" }}>Terkini</span>
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
                {newsArticles.map((article) => (
                  <div
                    key={article.id}
                    className="news-card"
                    style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column", transition: "box-shadow 0.2s, transform 0.2s" }}
                  >
                    {/* Cover image */}
                    {article.images?.[0] && (
                      <div style={{ aspectRatio: "16/9", overflow: "hidden", background: "#f3f4f6" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={article.images[0]} alt={article.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}

                    <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
                      {/* Source + date */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        {article.source && (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#dbeafe", color: "#1e40af" }}>
                            {article.source}
                          </span>
                        )}
                        {article.publishedAt && (
                          <span style={{ fontSize: "0.7rem", color: "#9ca3af", marginLeft: "auto" }}>
                            {new Date(article.publishedAt).toLocaleDateString(locale === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1rem", color: "#111827", marginBottom: 10, lineHeight: 1.35 }}>
                        {article.title}
                      </h3>

                      {/* Content preview */}
                      <p style={{ fontSize: "0.82rem", color: "#6b7280", lineHeight: 1.6, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                        {article.content}
                      </p>

                      {/* Source link */}
                      {article.sourceUrl && (
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 14, fontSize: "0.75rem", fontWeight: 700, color: "#003893", textDecoration: "none", letterSpacing: "0.04em", textTransform: "uppercase" }}
                        >
                          Baca Penuh <ChevronRight size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── GALLERY ─────────────────────────────────────────────────────────── */}
        {galleries.length > 0 && (
          <section id="gallery" style={{ background: "#ffffff", padding: "96px 0" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px" }}>
              <p style={{ fontSize: "0.7rem", letterSpacing: "0.35em", textTransform: "uppercase", color: "#003893", marginBottom: 10, fontWeight: 700 }}>
                {t("navGallery")}
              </p>
              <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.6rem, 3vw, 2.6rem)", textTransform: "uppercase", color: "#111827", marginBottom: 48, lineHeight: 1.15 }}>
                Galeri <span style={{ color: "#CC0001" }}>Foto</span>
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                {galleries.map((g) => {
                  const thumb = g.coverUrl ?? g.photos[0]?.thumbUrl ?? null;
                  return (
                    <Link key={g.id} href={`/gallery/${g.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                    <div className="gallery-card" style={{ height: "100%" }}>
                      {/* Cover image */}
                      <div style={{ aspectRatio: "16/9", background: "#f3f4f6", overflow: "hidden", position: "relative" }}>
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={g.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s" }}
                            className="gallery-cover-img"
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Images style={{ width: 36, height: 36, color: "#d1d5db" }} />
                          </div>
                        )}
                        {/* Year badge */}
                        <div
                          style={{
                            position: "absolute", top: 12, right: 12,
                            background: "rgba(0,56,147,0.85)", backdropFilter: "blur(4px)",
                            color: "#fff", fontSize: "0.7rem", fontWeight: 700,
                            letterSpacing: "0.1em", padding: "4px 10px", borderRadius: 20,
                          }}
                        >
                          {g.year}
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ padding: "16px 20px 20px" }}>
                        <p style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1rem", color: "#111827", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {g.title}
                        </p>
                        {g.description && (
                          <p style={{ fontSize: "0.8rem", color: "#6b7280", lineHeight: 1.55, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {g.description}
                          </p>
                        )}
                        <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                          {g._count.photos > 0 ? `${g._count.photos} foto` : "Tiada foto"}
                        </p>
                      </div>
                    </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer style={{ background: "#0f172a", borderTop: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Social media strip */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "40px 60px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 40 }}>

              {/* Official site */}
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "1rem", color: "#FFD700", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Malaysia Techlympics
                </p>
                <a
                  href="https://techlympics.my/"
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", textDecoration: "none", letterSpacing: "0.04em", transition: "color 0.2s" }}
                  className="footer-link"
                >
                  techlympics.my
                </a>
              </div>

              {/* Social icons */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <p style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginRight: 4 }}>Ikuti kami</p>

                {/* Instagram */}
                <a href="https://www.instagram.com/mytechlympics" target="_blank" rel="noopener noreferrer"
                  className="social-btn" title="Instagram"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.2s", textDecoration: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="rgba(255,255,255,0.7)" stroke="none"/>
                  </svg>
                </a>

                {/* Facebook */}
                <a href="https://www.facebook.com/myTechlympics" target="_blank" rel="noopener noreferrer"
                  className="social-btn" title="Facebook"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.2s", textDecoration: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                  </svg>
                </a>

                {/* X (Twitter) */}
                <a href="https://x.com/mytechlympics" target="_blank" rel="noopener noreferrer"
                  className="social-btn" title="X (Twitter)"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.2s", textDecoration: "none" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>

                {/* TikTok */}
                <a href="https://www.tiktok.com/@mytechlympics" target="_blank" rel="noopener noreferrer"
                  className="social-btn" title="TikTok"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", transition: "all 0.2s", textDecoration: "none" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.2 8.2 0 0 0 4.79 1.52V6.75a4.85 4.85 0 0 1-1.02-.06z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ padding: "24px 60px" }}>
            <div className="flex flex-wrap justify-between items-center gap-4" style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: "0.9rem", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>
                Malaysia Techlympics 2026
              </div>
              <div className="flex items-center gap-6">
                <LocaleSwitcher />
                <Link href="/organizer/login" className="text-xs text-slate-500 hover:text-white transition-colors" style={{ letterSpacing: "0.1em" }}>
                  {t("staffLogin")}
                </Link>
              </div>
              <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
                {t("footerCopy")}
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
