import type { Metadata } from "next";
import { JudgingTeamClient } from "@/components/judging/JudgingTeamClient";

export const metadata: Metadata = { title: "Nilai Pasukan" };

export default async function JudgingTeamPage({
  params,
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  return <JudgingTeamClient slug={slug} teamId={teamId} />;
}
