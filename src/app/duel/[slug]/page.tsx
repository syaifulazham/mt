import type { Metadata } from "next";
import { DuelBoardClient } from "@/components/duel/DuelBoardClient";

export const metadata: Metadata = { title: "Duel", robots: { index: false, follow: false } };

export default async function DuelBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DuelBoardClient slug={slug} />;
}
