import type { Metadata } from "next";
import { WalkInJudgingBoardClient } from "@/components/judging/WalkInJudgingBoardClient";

export const metadata: Metadata = { title: "Walk-in Penghakiman" };

export default async function WalkInJudgingBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <WalkInJudgingBoardClient slug={slug} />;
}
