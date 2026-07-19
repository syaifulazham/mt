import type { Metadata } from "next";
import { WalkInJudgingParticipantClient } from "@/components/judging/WalkInJudgingParticipantClient";

export const metadata: Metadata = { title: "Walk-in Penghakiman" };

export default async function WalkInJudgingParticipantPage({
  params,
}: {
  params: Promise<{ slug: string; regId: string }>;
}) {
  const { slug, regId } = await params;
  return <WalkInJudgingParticipantClient slug={slug} regId={regId} />;
}
