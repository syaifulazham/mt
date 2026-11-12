import type { Metadata, Viewport } from "next";
import { DuelControlClient } from "@/components/duel/DuelControlClient";

export const metadata: Metadata = { title: "Kawalan Duel", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7c3aed" };

// A duel control link: the competition's duel manager for whoever holds the passcode.
export default async function DuelControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DuelControlClient slug={slug} />;
}
