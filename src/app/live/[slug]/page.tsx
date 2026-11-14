import type { Metadata } from "next";
import { LiveScoreboardClient } from "@/components/live/LiveScoreboardClient";

export const metadata: Metadata = { title: "Papan Skor Langsung", robots: { index: false, follow: false } };

export default async function LiveScoreboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LiveScoreboardClient slug={slug} />;
}
