import { SignUp } from "@clerk/nextjs";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Daftar Akaun — Malaysia Techlympics" };

export default async function ManagerSignUpPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');
      `}</style>

      <div
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          minHeight: "100vh",
          background: "linear-gradient(160deg, #f0f4ff 0%, #ffffff 50%, #fff5f5 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflowX: "hidden",
          padding: "32px 16px",
        }}
      >
        {/* Subtle dot grid */}
        <div
          style={{
            position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
            backgroundImage: "radial-gradient(circle, rgba(0,56,147,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Top accent line */}
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, height: 4,
            background: "linear-gradient(90deg, #003893 0%, #CC0001 50%, #003893 100%)",
            zIndex: 50,
          }}
        />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%", maxWidth: 480 }}>

          {/* Logo + tagline */}
          <Link href="/" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <Image
              src="/logo-mt.svg"
              alt="Malaysia Techlympics"
              width={180}
              height={100}
              priority
              style={{ height: 52, width: "auto" }}
            />
            <span style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>
              Malaysia Techlympics 2026
            </span>
          </Link>

          {/* Heading */}
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: "1.6rem", color: "#111827", letterSpacing: "0.02em", margin: 0 }}>
              Daftar sebagai Pengurus
            </h1>
            <p style={{ fontSize: "0.88rem", color: "#6b7280", marginTop: 6 }}>
              Urus penyertaan sekolah anda di Malaysia Techlympics
            </p>
          </div>

          <SignUp
            appearance={{
              variables: {
                colorPrimary:         "#003893",
                colorBackground:      "#ffffff",
                colorInputBackground: "#f8fafc",
                colorText:            "#111827",
                colorTextSecondary:   "#6b7280",
                colorInputText:       "#111827",
                colorNeutral:         "#e5e7eb",
                borderRadius:         "8px",
                fontFamily:           "'Rajdhani', sans-serif",
                fontSize:             "1rem",
              },
              elements: {
                card: {
                  boxShadow: "0 4px 24px rgba(0,56,147,0.10), 0 1px 4px rgba(0,0,0,0.06)",
                  border:    "1px solid rgba(0,56,147,0.12)",
                  background: "#ffffff",
                },
                headerTitle: {
                  fontFamily:    "'Exo 2', sans-serif",
                  fontWeight:    700,
                  letterSpacing: "0.03em",
                  color:         "#111827",
                },
                headerSubtitle:    { color: "#6b7280" },
                formButtonPrimary: {
                  background:    "linear-gradient(135deg, #003893, #0047b3)",
                  color:         "#ffffff",
                  fontFamily:    "'Exo 2', sans-serif",
                  fontWeight:    700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  border:        "none",
                  boxShadow:     "0 2px 8px rgba(0,56,147,0.3)",
                },
                footerActionLink:          { color: "#003893" },
                identityPreviewEditButton: { color: "#003893" },
                formFieldInput: {
                  border:     "1px solid #d1d5db",
                  background: "#f8fafc",
                  color:      "#111827",
                },
                dividerLine: { background: "#e5e7eb" },
                dividerText: { color: "#9ca3af" },
              },
            }}
            fallbackRedirectUrl="/manager/onboarding"
            signInUrl="/manager/sign-in"
          />

          <p style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center", maxWidth: 320 }}>
            Dengan mendaftar, anda bersetuju dengan{" "}
            <a href="https://techlympics.my" style={{ color: "#003893" }} target="_blank" rel="noopener noreferrer">
              terma penggunaan
            </a>{" "}
            Malaysia Techlympics.
          </p>
        </div>
      </div>
    </>
  );
}
