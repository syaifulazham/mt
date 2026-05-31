import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In — Techlympics" };

export default async function ManagerSignInPage() {
  const { userId } = await auth();
  if (userId) redirect("/manager/dashboard");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@700;900&family=Rajdhani:wght@400;600;700&display=swap');
        @keyframes scan { 0% { top: -2px; } 100% { top: 100vh; } }
      `}</style>

      <div
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          background: "#020812",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflowX: "hidden",
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1,
            backgroundImage:
              "linear-gradient(rgba(0,245,255,0.04) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(0,245,255,0.04) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Radial glow */}
        <div
          style={{
            position: "fixed", top: "40%", left: "50%",
            transform: "translate(-50%,-50%)",
            width: 700, height: 700, pointerEvents: "none", zIndex: 1,
            background: "radial-gradient(ellipse, rgba(0,56,147,0.35) 0%, rgba(0,245,255,0.08) 40%, transparent 70%)",
          }}
        />

        {/* Scan line */}
        <div
          style={{
            position: "fixed", left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent, rgba(0,245,255,0.35), transparent)",
            animation: "scan 6s linear infinite",
            pointerEvents: "none", zIndex: 5,
          }}
        />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          {/* Logo — click to go home */}
          <Link href="/">
            <Image
              src="/logo-mt.svg"
              alt="Malaysia Techlympics"
              width={180}
              height={100}
              priority
              style={{
                height: 56,
                width: "auto",
                filter: [
                  "drop-shadow(0 0 12px rgba(0,245,255,0.5))",
                  "drop-shadow(1px 0 0 rgba(255,255,255,0.3))",
                  "drop-shadow(-1px 0 0 rgba(255,255,255,0.3))",
                ].join(" "),
                cursor: "pointer",
              }}
            />
          </Link>

          {/* Clerk sign-in card */}
          <SignIn
            appearance={{
              variables: {
                colorPrimary:        "#00c8ff",
                colorBackground:     "#0b1829",
                colorInputBackground:"#071220",
                colorText:           "#e8f4ff",
                colorTextSecondary:  "rgba(200,230,255,0.55)",
                colorInputText:      "#e8f4ff",
                colorNeutral:        "rgba(150,200,230,0.25)",
                borderRadius:        "6px",
                fontFamily:          "'Rajdhani', sans-serif",
                fontSize:            "1rem",
              },
              elements: {
                card: {
                  border:     "1px solid rgba(0,245,255,0.18)",
                  boxShadow:  "0 0 50px rgba(0,245,255,0.07), inset 0 1px 0 rgba(0,245,255,0.08)",
                  background: "#0b1829",
                },
                headerTitle: {
                  fontFamily:    "'Exo 2', sans-serif",
                  fontWeight:    700,
                  letterSpacing: "0.04em",
                  color:         "#ffffff",
                },
                headerSubtitle: { color: "rgba(200,230,255,0.55)" },
                formButtonPrimary: {
                  background:    "linear-gradient(135deg, #003893, #0055cc)",
                  border:        "1px solid rgba(0,245,255,0.4)",
                  color:         "#00F5FF",
                  fontFamily:    "'Exo 2', sans-serif",
                  fontWeight:    700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  boxShadow:     "0 0 18px rgba(0,245,255,0.15)",
                },
                footerActionLink:         { color: "#00c8ff" },
                identityPreviewEditButton:{ color: "#00c8ff" },
                formFieldInput: {
                  border:     "1px solid rgba(0,245,255,0.2)",
                  background: "#071220",
                  color:      "#e8f4ff",
                },
                dividerLine:  { background: "rgba(0,245,255,0.15)" },
                dividerText:  { color: "rgba(200,230,255,0.4)" },
              },
            }}
            fallbackRedirectUrl="/manager/dashboard"
            signUpUrl="/manager/sign-up"
          />
        </div>
      </div>
    </>
  );
}
