import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Peta Pertandingan — Malaysia Techlympics 2026",
  description: "Laluan lengkap menuju peringkat kebangsaan — terokai semua kluster, pertandingan, dan kategori penyertaan rasmi Techlympics 2026.",
};

export default async function MappingPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const { userId } = await auth().catch(() => ({ userId: null }));
  const [manager, t] = await Promise.all([
    userId
      ? db.managerProfile.findUnique({
          where: { clerkUserId: userId },
          select: { name: true },
        })
      : Promise.resolve(null),
    getTranslations({ locale, namespace: "landing" }),
  ]);

  const clerkUser = userId && !manager ? await currentUser() : null;
  const clerkDisplayName =
    clerkUser?.firstName ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
    null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap');
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
        @media (max-width: 767px) {
          .map-nav-links { display: none !important; }
          .map-nav-staff { display: none !important; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* ── NAV ── */}
        <nav
          style={{
            height: 64,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 clamp(16px,4vw,40px)",
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(0,0,0,0.07)",
            boxShadow: "0 1px 16px rgba(0,0,0,0.06)",
            zIndex: 50,
            fontFamily: "'Rajdhani', sans-serif",
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center" }}>
            <Image
              src="/logo-mt.svg"
              alt="Malaysia Techlympics 2026"
              width={140}
              height={80}
              priority
              style={{ height: "clamp(28px,5vw,38px)", width: "auto" }}
            />
          </Link>

          <ul className="map-nav-links" style={{ display: "flex", gap: 32, listStyle: "none", margin: 0, padding: 0 }}>
            <li><Link href="/#categories" className="nav-link">{t("navCompetition")}</Link></li>
            <li><Link href="/#news" className="nav-link">{t("navNews")}</Link></li>
            <li><Link href="/#announcements" className="nav-link">{t("navAnnouncements")}</Link></li>
            <li><Link href="/#gallery" className="nav-link">{t("navGallery")}</Link></li>
          </ul>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LocaleSwitcher />
            <Link href="/organizer/login" className="map-nav-staff" style={{ fontSize: "0.75rem", color: "#9ca3af", textDecoration: "none", letterSpacing: "0.08em" }}>
              {t("staffLogin")}
            </Link>
            {manager ? (
              <Link href="/manager/dashboard">
                <button
                  style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 12px", borderRadius: 999, background: "#003893", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  {t("dashboardButton")}
                </button>
              </Link>
            ) : userId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {clerkDisplayName && <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>{clerkDisplayName}</span>}
                <Link href="/manager/onboarding">
                  <button style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 12px", borderRadius: 999, background: "#16a34a", color: "#fff", border: "none", cursor: "pointer" }}>
                    {t("completeProfile")}
                  </button>
                </Link>
              </div>
            ) : (
              <Link href="/manager/sign-up">
                <button
                  style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 12px", borderRadius: 999, background: "#CC0001", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  {t("registerNow")}
                </button>
              </Link>
            )}
          </div>
        </nav>

        {/* ── Map iframe ── */}
        <iframe
          src="/api/v2/organizer/mapping/preview-html"
          style={{ flex: 1, width: "100%", border: "none", display: "block" }}
          title={t("iframeTitle")}
        />
      </div>
    </>
  );
}
