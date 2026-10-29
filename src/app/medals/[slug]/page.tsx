import type { Metadata } from "next";
import { MedalBoardClient } from "@/components/medals/MedalBoardClient";

export const metadata: Metadata = { title: "Medal Tally", robots: { index: false, follow: false } };

export default async function MedalBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MedalBoardClient slug={slug} />;
}
