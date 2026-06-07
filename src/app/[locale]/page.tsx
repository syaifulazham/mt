import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { HeroCarousel } from "@/components/landing/HeroCarousel";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Images } from "lucide-react";

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

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const { userId } = await auth().catch(() => ({ userId: null }));
  const [manager, themes, galleries, t] = await Promise.all([
    userId
      ? db.managerProfile.findUnique({
          where: { clerkUserId: userId },
          select: { name: true, profileComplete: true },
        })
      : Promise.resolve(null),
    db.theme.findMany({ orderBy: { name: "asc" } }),
    db.gallery.findMany({
      orderBy: { year: "desc" },
      include: {
        photos: { orderBy: { order: "asc" }, take: 1 },
        _count: { select: { photos: true } },
      },
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
            {(["navAbout", "navCategories", "navSchedule", "navVenues", "navGallery"] as const).map((key) => (
              <li key={key}>
                <a href="#" className="nav-link">{t(key)}</a>
              </li>
            ))}
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
              {themes.map((c) => {
                const accent = c.color ?? "#003893";
                return (
                  <div key={c.id} className="theme-card">
                    <div className="theme-card-bar" style={{ background: accent }} />
                    {renderThemeIcon(c.logoUrl, c.name)}
                    <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#111827", marginBottom: 8 }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: "0.82rem", lineHeight: 1.65, color: "#6b7280" }}>
                      {c.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

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
                    <div key={g.id} className="gallery-card">
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
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer
          style={{
            background: "#0f172a",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "40px 60px",
          }}
        >
          <div className="flex flex-wrap justify-between items-center gap-4">
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
        </footer>

      </div>
    </>
  );
}
