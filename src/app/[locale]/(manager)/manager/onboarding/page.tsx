import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { OnboardingForm } from "@/components/manager/OnboardingForm";
import { LocaleSwitcher } from "@/components/manager/LocaleSwitcher";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Complete your profile — Malaysia Techlympics 2026" };

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  void locale;

  const [t, tl] = await Promise.all([
    getTranslations("onboarding"),
    getTranslations("landing"),
  ]);

  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const profile = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (profile?.profileComplete) redirect("/manager/dashboard");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
        @keyframes ob-scan {
          0%   { top: -2px; }
          100% { top: 100vh; }
        }
        @keyframes ob-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        .ob-nav-link {
          position: relative;
          color: rgba(255,255,255,0.45);
          text-decoration: none;
          font-size: 0.85rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          transition: color 0.25s;
          padding-bottom: 3px;
        }
        .ob-nav-link:hover { color: #fff; }
        .ob-nav-link::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0;
          width: 0; height: 1px;
          background: rgba(255,255,255,0.5);
          transition: width 0.3s ease;
        }
        .ob-nav-link:hover::after { width: 100%; }

      `}</style>

      <div
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          background: "#020812",
          color: "#fff",
          minHeight: "100vh",
        }}
      >
        {/* Grid overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            zIndex: 1,
          }}
        />

        {/* Centre glow */}
        <div
          className="fixed pointer-events-none"
          style={{
            top: "40%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 800, height: 800,
            background:
              "radial-gradient(ellipse, rgba(0,56,147,0.3) 0%, rgba(0,245,255,0.06) 40%, transparent 70%)",
            zIndex: 1,
          }}
        />

        {/* Scan line */}
        <div
          className="fixed left-0 right-0 h-0.5 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(0,245,255,0.3), transparent)",
            animation: "ob-scan 6s linear infinite",
            zIndex: 5,
          }}
        />

        {/* ── NAV ── */}
        <nav
          className="fixed top-0 left-0 right-0 flex justify-between items-center"
          style={{
            zIndex: 100,
            padding: "18px 60px",
            background: "linear-gradient(180deg, rgba(2,8,18,0.95) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(0,245,255,0.08)",
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
              style={{ height: 44, width: "auto" }}
            />
          </Link>

          <ul className="hidden md:flex gap-9 list-none m-0 p-0">
            {([
              ["navAbout", tl("navAbout")],
              ["navCategories", tl("navCategories")],
              ["navSchedule", tl("navSchedule")],
              ["navVenues", tl("navVenues")],
              ["navGallery", tl("navGallery")],
            ] as [string, string][]).map(([key, label]) => (
              <li key={key}><Link href="/#" className="ob-nav-link">{label}</Link></li>
            ))}
          </ul>

          <div className="flex items-center gap-4">
            <LocaleSwitcher dark />
            <Link
              href="/organizer/login"
              style={{
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.35)",
                textDecoration: "none",
                letterSpacing: "0.1em",
                transition: "color 0.2s",
              }}
            >
              {tl("staffLogin")}
            </Link>
          </div>
        </nav>

        {/* ── CONTENT ── */}
        <div
          className="relative flex flex-col items-center justify-center"
          style={{ zIndex: 10, minHeight: "100vh", padding: "120px 24px 60px" }}
        >
          {/* Status badge */}
          <div
            className="inline-flex items-center gap-2.5 mb-8"
            style={{
              background: "rgba(0,245,255,0.06)",
              border: "1px solid rgba(0,245,255,0.2)",
              borderRadius: 2,
              padding: "7px 18px",
              fontSize: "0.68rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#00F5FF",
            }}
          >
            <span
              style={{
                width: 6, height: 6,
                background: "#00F5FF",
                borderRadius: "50%",
                display: "inline-block",
                animation: "ob-pulse 1.8s infinite",
              }}
            />
            {t("badge")}
          </div>

          <h1
            style={{
              fontFamily: "'Exo 2', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
              textAlign: "center",
            }}
          >
            {t("heading")}
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.9rem",
              marginBottom: 40,
              textAlign: "center",
            }}
          >
            {t("subheading")}
          </p>

          {/* Glass card */}
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(0,245,255,0.12)",
              borderRadius: 4,
              padding: "36px 40px",
              backdropFilter: "blur(12px)",
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <OnboardingForm />
          </div>
        </div>
      </div>
    </>
  );
}
