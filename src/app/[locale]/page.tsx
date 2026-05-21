import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Countdown } from "@/components/landing/Countdown";
import { DroneSceneLoader as DroneScene } from "@/components/landing/DroneSceneLoader";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Malaysia Techlympics 2026",
  description: "Malaysia's premier technology olympiad — empowering the next generation of innovators, engineers, and digital creators.",
};

const STATS = [
  { value: "50+",   label: "Competition Categories" },
  { value: "100K+", label: "Expected Participants"  },
  { value: "16",    label: "States & Territories"   },
  { value: "RM 2M", label: "Total Prize Pool"       },
];

function renderThemeIcon(logoUrl: string | null, name: string) {
  if (!logoUrl) {
    return (
      <span style={{ fontSize: "2.2rem", display: "block", marginBottom: 18 }}>
        {name.charAt(0)}
      </span>
    );
  }
  if (logoUrl.startsWith("/uploads/") || logoUrl.startsWith("https://") || logoUrl.startsWith("http://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={name} style={{ width: 42, height: 42, objectFit: "contain", marginBottom: 18, display: "block" }} />
    );
  }
  return (
    <span style={{ fontSize: "2.2rem", display: "block", marginBottom: 18 }}>{logoUrl}</span>
  );
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  const { userId } = await auth();
  const [manager, themes] = await Promise.all([
    userId
      ? db.managerProfile.findUnique({
          where: { clerkUserId: userId },
          select: { name: true, profileComplete: true },
        })
      : Promise.resolve(null),
    db.theme.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      {/* ── Google Fonts ──────────────────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700;900&family=Rajdhani:wght@400;600;700&display=swap');`}</style>

      <div
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          background: "#020812",
          color: "#fff",
          minHeight: "100vh",
          overflowX: "hidden",
        }}
      >
        {/* Three.js background */}
        <DroneScene />

        {/* CSS grid overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,245,255,0.04) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(0,245,255,0.04) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            zIndex: 1,
          }}
        />
        {/* Radial center glow */}
        <div
          className="fixed pointer-events-none"
          style={{
            top: "40%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 900, height: 900,
            background: "radial-gradient(ellipse, rgba(0,56,147,0.35) 0%, rgba(0,245,255,0.08) 40%, transparent 70%)",
            zIndex: 1,
          }}
        />
        {/* Scan line */}
        <div
          className="fixed left-0 right-0 h-0.5 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(0,245,255,0.35), transparent)",
            animation: "scan 6s linear infinite",
            zIndex: 5,
          }}
        />

        {/* ── NAV ─────────────────────────────────────────────────────────────── */}
        <nav
          className="fixed top-0 left-0 right-0 flex justify-between items-center"
          style={{
            zIndex: 100,
            padding: "18px 60px",
            background: "linear-gradient(180deg, rgba(2,8,18,0.95) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(0,245,255,0.1)",
            backdropFilter: "blur(4px)",
          }}
        >
          <Link href="/" style={{ display: "inline-flex", alignItems: "center" }}>
            <Image
              src="/logo-mt.svg"
              alt="Malaysia Techlympics 2026"
              width={160}
              height={90}
              priority
              className="logo-nav-glitch"
              style={{
                height: 44,
                width: "auto",
                filter: [
                  "drop-shadow(1px 0 0 rgba(255,255,255,0.45))",
                  "drop-shadow(-1px 0 0 rgba(255,255,255,0.45))",
                  "drop-shadow(0 1px 0 rgba(255,255,255,0.45))",
                  "drop-shadow(0 -1px 0 rgba(255,255,255,0.45))",
                ].join(" "),
              }}
            />
          </Link>

          <ul className="hidden md:flex gap-9 list-none">
            {["About", "Categories", "Schedule", "Venues", "Gallery"].map(l => (
              <li key={l}>
                <a href="#" className="nav-link">{l}</a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <Link
              href="/organizer/login"
              className="text-xs text-slate-400 hover:text-white transition-colors"
              style={{ letterSpacing: "0.1em" }}
            >
              Staff Login
            </Link>
            {manager ? (
              <div className="flex items-center gap-3">
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.06em",
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {manager.name}
                </span>
                <Link href="/manager/dashboard">
                  <button
                    style={{
                      background: "linear-gradient(135deg, #003893, #0055cc)",
                      border: "1px solid rgba(0,245,255,0.4)",
                      color: "#00F5FF",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      padding: "9px 22px",
                      cursor: "pointer",
                      clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
                      boxShadow: "0 0 18px rgba(0,245,255,0.15)",
                    }}
                  >
                    Dashboard →
                  </button>
                </Link>
              </div>
            ) : (
              <Link href="/manager/sign-up">
                <button
                  style={{
                    background: "transparent",
                    border: "1px solid #00F5FF",
                    color: "#00F5FF",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding: "9px 22px",
                    cursor: "pointer",
                    clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
                  }}
                >
                  Register Now
                </button>
              </Link>
            )}
          </div>
        </nav>

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <section
          className="relative flex flex-col items-center justify-center text-center"
          style={{ zIndex: 10, minHeight: "100vh", padding: "120px 40px 80px" }}
        >
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2.5 mb-9"
            style={{
              background: "rgba(0,245,255,0.06)",
              border: "1px solid rgba(0,245,255,0.25)",
              borderRadius: 2,
              padding: "8px 20px",
              fontSize: "0.72rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#00F5FF",
            }}
          >
            <span
              className="rounded-full"
              style={{ width: 6, height: 6, background: "#00F5FF", animation: "pulse 1.8s infinite", display: "inline-block" }}
            />
            Registration Now Open — 2026 Edition
          </div>

          {/* Hero logo — glitch wrapper */}
          <div
            className="logo-glitch"
            style={{
              position: "relative",
              display: "inline-block",
              width: "clamp(200px, 30vw, 320px)",
              marginBottom: 24,
              filter: [
              "drop-shadow(1px 0 0 rgba(255,255,255,0.55))",
              "drop-shadow(-1px 0 0 rgba(255,255,255,0.55))",
              "drop-shadow(0 1px 0 rgba(255,255,255,0.55))",
              "drop-shadow(0 -1px 0 rgba(255,255,255,0.55))",
              "drop-shadow(0 0 20px rgba(0,245,255,0.25))",
            ].join(" "),
            }}
          >
            <Image
              src="/logo-mt.svg"
              alt="Malaysia Techlympics 2026"
              width={320}
              height={180}
              priority
              className="logo-main"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
            {/* Red channel ghost */}
            <Image
              src="/logo-mt.svg"
              alt=""
              width={320}
              height={180}
              className="logo-ghost-r"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "auto", pointerEvents: "none", opacity: 0 }}
            />
            {/* Cyan channel ghost */}
            <Image
              src="/logo-mt.svg"
              alt=""
              width={320}
              height={180}
              className="logo-ghost-c"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "auto", pointerEvents: "none", opacity: 0 }}
            />
          </div>

          {/* Pre-title */}
          <p
            className="mb-3.5"
            style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.8rem", letterSpacing: "0.5em", textTransform: "uppercase", color: "#FFD700" }}
          >
            Ministry of Science, Technology &amp; Innovation
          </p>

          {/* Main title */}
          <h1
            style={{
              fontFamily: "'Exo 2', sans-serif",
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            <span className="block text-white" style={{ fontSize: "clamp(3.2rem, 8vw, 7.5rem)" }}>Malaysia</span>
            <span
              className="block"
              style={{
                fontSize: "clamp(3.2rem, 8vw, 7.5rem)",
                background: "linear-gradient(135deg, #CC0001 0%, #FFD700 50%, #CC0001 100%)",
                backgroundSize: "200%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 4s linear infinite",
              }}
            >
              Techlympics
            </span>
            <span
              className="block"
              style={{ fontSize: "clamp(1.8rem, 4.5vw, 4rem)", letterSpacing: "0.3em", color: "#00F5FF", WebkitTextFillColor: "#00F5FF" }}
            >
              2026
            </span>
          </h1>

          <p
            className="mt-7"
            style={{ maxWidth: 560, fontSize: "1.05rem", lineHeight: 1.7, color: "rgba(255,255,255,0.5)" }}
          >
            Where <span style={{ color: "rgba(255,255,255,0.85)" }}>innovation meets competition.</span> The nation&apos;s premier technology olympiad empowering the next generation of{" "}
            <span style={{ color: "rgba(255,255,255,0.85)" }}>Malaysian innovators, engineers, and digital creators.</span>
          </p>

          {/* CTAs */}
          <div className="flex gap-4 mt-12 flex-wrap justify-center">
            {manager ? (
              <Link href="/manager/dashboard">
                <button
                  style={{
                    background: "linear-gradient(135deg, #003893, #0055cc)",
                    border: "1px solid rgba(0,245,255,0.5)",
                    color: "#00F5FF",
                    fontFamily: "'Exo 2', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding: "15px 38px",
                    cursor: "pointer",
                    clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",
                    boxShadow: "0 0 30px rgba(0,245,255,0.2)",
                  }}
                >
                  Go to Dashboard →
                </button>
              </Link>
            ) : (
              <Link href="/manager/sign-up">
                <button
                  style={{
                    background: "linear-gradient(135deg, #CC0001, #ff2244)",
                    border: "none",
                    color: "#fff",
                    fontFamily: "'Exo 2', sans-serif",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding: "15px 38px",
                    cursor: "pointer",
                    clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",
                    boxShadow: "0 0 30px rgba(204,0,1,0.4)",
                  }}
                >
                  Register Now
                </button>
              </Link>
            )}
            <button
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.75)",
                fontFamily: "'Exo 2', sans-serif",
                fontWeight: 600,
                fontSize: "0.85rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "15px 38px",
                cursor: "pointer",
                clipPath: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",
              }}
            >
              Explore Categories
            </button>
          </div>

          {/* Countdown */}
          <div className="mt-16">
            <Countdown />
          </div>
        </section>

        {/* ── STATS STRIP ─────────────────────────────────────────────────────── */}
        <div
          className="relative flex justify-center flex-wrap gap-0"
          style={{
            zIndex: 10,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            padding: "40px 0",
            margin: "0 0 80px",
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="text-center"
              style={{
                padding: "0 40px",
                borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                minWidth: 180,
              }}
            >
              <div
                style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: "2.8rem", color: "#fff", lineHeight: 1 }}
              >
                {s.value.replace(/(\d+)([^\d]+)$/, (_, n, u) => n + `<span style="color:#FFD700">${u}</span>`).includes("<span") ? (
                  <span dangerouslySetInnerHTML={{ __html: s.value.replace(/([KM+]+)$/, '<span style="color:#FFD700">$1</span>').replace(/^(RM)/, '<span style="color:#FFD700">$1 </span>') }} />
                ) : (
                  <span>{s.value}</span>
                )}
              </div>
              <div style={{ fontSize: "0.75rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── CATEGORIES ──────────────────────────────────────────────────────── */}
        <section
          className="relative"
          style={{ zIndex: 10, maxWidth: 1200, margin: "0 auto", padding: "0 60px 100px" }}
        >
          <p style={{ fontSize: "0.7rem", letterSpacing: "0.35em", textTransform: "uppercase", color: "#00F5FF", marginBottom: 10, opacity: 0.8 }}>
            Competition Tracks
          </p>
          <h2
            style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: "clamp(1.8rem, 3.5vw, 3rem)", textTransform: "uppercase", color: "#fff", marginBottom: 50, lineHeight: 1.1 }}
          >
            Extraordinary, <span style={{ color: "#FFD700" }}>Global</span>,<br />
            Inclusive.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 2,
            }}
          >
            {themes.map(c => {
              const accent = c.color ?? "#00F5FF";
              return (
                <div
                  key={c.id}
                  className="cat-card group relative overflow-hidden"
                  style={{
                    background: "rgba(0,232,255,0.07)",
                    border: "1px solid rgba(0,245,255,0.08)",
                    padding: "32px 28px",
                    cursor: "default",
                    transition: "border-color 0.3s, background 0.3s",
                  }}
                >
                  {/* Left accent bar */}
                  <div
                    className="cat-card-bar absolute top-0 left-0 w-[3px]"
                    style={{ background: accent, height: 0, transition: "height 0.4s" }}
                  />
                  {renderThemeIcon(c.logoUrl, c.name)}
                  <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#fff", marginBottom: 10 }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: "0.82rem", lineHeight: 1.65, color: "rgba(255,255,255,0.45)" }}>
                    {c.description}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <footer
          className="relative flex flex-wrap justify-between items-center gap-4"
          style={{
            zIndex: 10,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "40px 60px",
          }}
        >
          <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: "0.9rem", letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)" }}>
            Malaysia Techlympics 2026
          </div>
          <div className="flex items-center gap-6">
            <LocaleSwitcher />
            <Link href="/organizer/login" className="text-xs text-slate-500 hover:text-white transition-colors" style={{ letterSpacing: "0.1em" }}>
              Staff Login
            </Link>
          </div>
          <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
            © 2026 MOSTI · All Rights Reserved
          </div>
        </footer>
      </div>

      {/* ── Global keyframes for this page ────────────────────────────────────── */}
      <style>{`
        @keyframes scan {
          0%   { top: -2px; }
          100% { top: 100vh; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .cat-card:hover {
          border-color: rgba(0,245,255,0.28) !important;
          background: rgba(0,245,255,0.11) !important;
        }
        .cat-card:hover .cat-card-bar {
          height: 100% !important;
        }

        /* ── Nav links ───────────────────────────────────────── */
        .nav-link {
          position: relative;
          color: rgba(255,255,255,0.45);
          text-decoration: none;
          font-size: 0.85rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          transition: color 0.25s;
          padding-bottom: 3px;
        }
        .nav-link:hover {
          color: #fff;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0;
          height: 1px;
          background: rgba(255,255,255,0.5);
          transition: width 0.3s ease;
        }
        .nav-link:hover::after {
          width: 100%;
        }

        /* ── Glitch logo ─────────────────────────────────────── */
        @keyframes glitch-jitter {
          0%,  80%  { transform: translate(0, 0) skewX(0deg); clip-path: none; }
          81%        { transform: translate(-3px, 0) skewX(-1.5deg); clip-path: inset(18% 0 55% 0); }
          82%        { transform: translate(4px, 1px) skewX(2deg);   clip-path: inset(0); }
          83%        { transform: translate(-2px, -1px);               clip-path: inset(62% 0 8% 0); }
          84%        { transform: translate(3px, 0) skewX(-1deg);     clip-path: inset(38% 0 30% 0); }
          85%        { transform: translate(0) skewX(0deg);           clip-path: inset(0); }
          86%        { transform: translate(-4px, 2px);               clip-path: inset(72% 0 5% 0); }
          87%        { transform: translate(2px, -1px) skewX(1deg);   clip-path: none; }
          88%, 100%  { transform: translate(0, 0) skewX(0deg); clip-path: none; }
        }
        @keyframes glitch-ghost-r {
          0%,  80%  { opacity: 0; transform: translate(0); }
          81%        { opacity: 0.7; transform: translate(5px, 0);   clip-path: inset(18% 0 55% 0); filter: hue-rotate(320deg) saturate(8) brightness(1.2); }
          82%        { opacity: 0.4; transform: translate(-3px, 1px); clip-path: inset(70% 0 8% 0);  filter: hue-rotate(320deg) saturate(8); }
          83%        { opacity: 0.6; transform: translate(6px, 0);   clip-path: inset(40% 0 32% 0); filter: hue-rotate(320deg) saturate(6); }
          84%        { opacity: 0;   transform: translate(0); }
          85%        { opacity: 0.5; transform: translate(4px, -1px); clip-path: inset(5% 0 80% 0);  filter: hue-rotate(320deg) saturate(8); }
          86%, 100%  { opacity: 0; transform: translate(0); }
        }
        @keyframes glitch-ghost-c {
          0%,  82%  { opacity: 0; transform: translate(0); }
          83%        { opacity: 0.6; transform: translate(-5px, 1px); clip-path: inset(55% 0 18% 0); filter: hue-rotate(170deg) saturate(8) brightness(1.3); }
          84%        { opacity: 0.5; transform: translate(-6px, 0);  clip-path: inset(25% 0 48% 0); filter: hue-rotate(170deg) saturate(6); }
          85%        { opacity: 0;   transform: translate(0); }
          86%        { opacity: 0.55; transform: translate(-4px, -1px); clip-path: inset(78% 0 5% 0); filter: hue-rotate(170deg) saturate(8); }
          87%, 100%  { opacity: 0; transform: translate(0); }
        }
        @keyframes glitch-nav {
          0%,  88%  { transform: translate(0) skewX(0deg); filter: none; }
          89%        { transform: translate(-2px, 0) skewX(-1deg); filter: brightness(1.5); }
          90%        { transform: translate(2px, 0); filter: none; clip-path: inset(30% 0 40% 0); }
          91%        { transform: translate(0) skewX(1deg); clip-path: none; }
          92%        { transform: translate(-1px, 0); filter: brightness(1.3) hue-rotate(180deg); }
          93%, 100%  { transform: translate(0) skewX(0deg); filter: none; clip-path: none; }
        }

        .logo-main {
          animation: glitch-jitter 3.5s steps(1) infinite;
        }
        .logo-ghost-r {
          animation: glitch-ghost-r 3.5s steps(1) infinite;
        }
        .logo-ghost-c {
          animation: glitch-ghost-c 3.5s steps(1) infinite;
        }
        .logo-nav-glitch {
          animation: glitch-nav 4.2s steps(1) infinite;
        }
      `}</style>
    </>
  );
}
