import type { Metadata, Viewport } from "next";
import { ScorecardPublicClient } from "@/components/duel/ScorecardPublicClient";

export const metadata: Metadata = { title: "Kad Skor Duel", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e11d48" };

// One duel's scorecard for whoever holds its 5-character passcode (a marshal's phone).
export default async function ScorecardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ScorecardPublicClient slug={slug} />;
}
