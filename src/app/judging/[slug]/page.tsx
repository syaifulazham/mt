import type { Metadata } from "next";
import { JudgingBoardClient } from "@/components/judging/JudgingBoardClient";

export const metadata: Metadata = { title: "Judging Board" };

export default async function JudgingBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <JudgingBoardClient slug={slug} />;
}
