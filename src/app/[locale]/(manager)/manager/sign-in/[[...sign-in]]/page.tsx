import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In — Malaysia Techlympics 2026" };

export default async function ManagerSignInPage() {
  const { userId } = await auth();
  if (userId) redirect("/manager/dashboard");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
        @keyframes fadein { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse-gold { 0%,100% { opacity:.7; } 50% { opacity:1; } }
        .signin-hero-content { animation: fadein 0.8s ease both; }
      `}</style>

      <div style={{ fontFamily: "'Rajdhani', sans-serif", minHeight: "100vh", display: "flex" }}>

        {/* ── LEFT PANEL — hero branding ──────────────────────────────────── */}
        <div
          className="hidden lg:flex"
          style={{
            width: "44%",
            flexShrink: 0,
            position: "relative",
            background: "linear-gradient(155deg, #001233 0%, #003893 45%, #CC0001 100%)",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            padding: "60px 48px",
          }}
        >
          {/* Grid overlay */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />

          {/* Gold corner accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, width: 180, height: 180,
            background: "radial-gradient(ellipse at top left, rgba(255,215,0,0.12), transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: 0, right: 0, width: 220, height: 220,
            background: "radial-gradient(ellipse at bottom right, rgba(204,0,1,0.2), transparent 70%)",
            pointerEvents: "none",
          }} />

          <div className="signin-hero-content" style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 340 }}>

            {/* Registration open badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 32,
              background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 100, padding: "6px 16px",
              fontSize: "0.68rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#fff",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse-gold 2s infinite", display: "inline-block" }} />
              Pendaftaran Dibuka
            </div>

            {/* Logo */}
            <div style={{ marginBottom: 28 }}>
              <Image
                src="/logo-mt.svg"
                alt="Malaysia Techlympics 2026"
                width={240}
                height={136}
                priority
                style={{
                  width: "clamp(160px,18vw,240px)", height: "auto",
                  filter: [
                    "drop-shadow(2px 0px 0 #fff)",
                    "drop-shadow(-2px 0px 0 #fff)",
                    "drop-shadow(0px 2px 0 #fff)",
                    "drop-shadow(0px -2px 0 #fff)",
                    "drop-shadow(0 0 14px rgba(255,255,255,0.55))",
                  ].join(" "),
                }}
              />
            </div>

            {/* Ministry label */}
            <p style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: "0.68rem", letterSpacing: "0.38em", textTransform: "uppercase",
              color: "#FFD700", marginBottom: 10,
            }}>
              Kementerian Pendidikan Malaysia
            </p>

            {/* Main title */}
            <h1 style={{
              fontFamily: "'Exo 2', sans-serif", fontWeight: 900,
              lineHeight: 0.92, letterSpacing: "-0.02em", textTransform: "uppercase",
              marginBottom: 0,
            }}>
              <span style={{ display: "block", color: "#ffffff", fontSize: "clamp(2rem,3.2vw,2.8rem)" }}>Malaysia</span>
              <span style={{
                display: "block",
                fontSize: "clamp(2rem,3.2vw,2.8rem)",
                background: "linear-gradient(135deg, #CC0001 0%, #FFD700 50%, #CC0001 100%)",
                backgroundSize: "200%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                Techlympics
              </span>
              <span style={{
                display: "block", color: "rgba(255,255,255,0.85)",
                fontSize: "clamp(1.2rem,2vw,1.8rem)", letterSpacing: "0.32em",
              }}>
                2026
              </span>
            </h1>

            {/* Tagline */}
            <p style={{
              marginTop: 24, color: "rgba(255,255,255,0.6)",
              fontSize: "0.82rem", letterSpacing: "0.06em", lineHeight: 1.55,
            }}>
              Empowering the next generation of innovators, engineers &amp; digital creators.
            </p>

            {/* Divider */}
            <div style={{
              margin: "28px auto", width: 48, height: 2,
              background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
            }} />

            {/* Feature tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {["Olimpiad Teknologi", "Sekolah Seluruh Malaysia", "Percuma"].map((tag) => (
                <span key={tag} style={{
                  fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 100, padding: "3px 12px",
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Back to home link */}
          <Link
            href="/"
            style={{
              position: "absolute", bottom: 28, left: 0, right: 0,
              textAlign: "center", color: "rgba(255,255,255,0.4)",
              fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase",
              textDecoration: "none", transition: "color 0.2s",
            }}
          >
            ← Kembali ke Laman Utama
          </Link>
        </div>

        {/* ── RIGHT PANEL — sign-in form ───────────────────────────────────── */}
        <div style={{
          flex: 1, background: "#f8fafc",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 24px",
          minHeight: "100vh",
        }}>
          {/* Mobile logo (shown only on small screens) */}
          <div className="lg:hidden" style={{ marginBottom: 32 }}>
            <Link href="/">
              <Image
                src="/logo-mt.svg"
                alt="Malaysia Techlympics 2026"
                width={160}
                height={90}
                priority
                style={{ height: 44, width: "auto" }}
              />
            </Link>
          </div>

          {/* Clerk card */}
          <SignIn
            appearance={{
              variables: {
                colorPrimary:         "#003893",
                colorBackground:      "#ffffff",
                colorInputBackground: "#f8fafc",
                colorText:            "#111827",
                colorTextSecondary:   "#6b7280",
                colorInputText:       "#111827",
                colorNeutral:         "#e5e7eb",
                borderRadius:         "10px",
                fontFamily:           "'Rajdhani', sans-serif",
                fontSize:             "1rem",
              },
              elements: {
                card: {
                  border:     "1px solid #e5e7eb",
                  boxShadow:  "0 4px 32px rgba(0,56,147,0.08), 0 1px 4px rgba(0,0,0,0.04)",
                  background: "#ffffff",
                },
                headerTitle: {
                  fontFamily:    "'Exo 2', sans-serif",
                  fontWeight:    700,
                  letterSpacing: "0.02em",
                  color:         "#111827",
                },
                headerSubtitle: { color: "#6b7280" },
                formButtonPrimary: {
                  background:    "#003893",
                  border:        "none",
                  color:         "#ffffff",
                  fontFamily:    "'Exo 2', sans-serif",
                  fontWeight:    700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  boxShadow:     "0 2px 12px rgba(0,56,147,0.25)",
                },
                footerActionLink:          { color: "#003893" },
                identityPreviewEditButton: { color: "#003893" },
                formFieldInput: {
                  border:     "1px solid #e5e7eb",
                  background: "#f8fafc",
                  color:      "#111827",
                },
                dividerLine: { background: "#e5e7eb" },
                dividerText: { color: "#9ca3af" },
              },
            }}
            fallbackRedirectUrl="/manager/dashboard"
            signUpUrl="/manager/sign-up"
          />

          {/* Desktop back link */}
          <p className="hidden lg:block" style={{ marginTop: 24, fontSize: "0.78rem", color: "#9ca3af" }}>
            <Link href="/" style={{ color: "#003893", textDecoration: "none" }}>
              ← Kembali ke Laman Utama
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
