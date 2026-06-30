import type { Metadata } from "next";
import { ResultsBoardClient } from "@/components/results/ResultsBoardClient";

export const metadata: Metadata = { title: "Keputusan" };

export default async function ResultsBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ResultsBoardClient slug={slug} />;
}
