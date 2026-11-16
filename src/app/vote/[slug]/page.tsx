import type { Metadata } from "next";
import { VoteClient } from "@/components/voting/VoteClient";

export const metadata: Metadata = { title: "Undian Awam", robots: { index: false, follow: false } };

export default async function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <VoteClient slug={slug} />;
}
