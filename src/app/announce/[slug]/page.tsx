import type { Metadata } from "next";
import { AnnounceBoardClient } from "@/components/announce/AnnounceBoardClient";

export const metadata: Metadata = { title: "Pengumuman Keputusan" };

export default async function AnnouncePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AnnounceBoardClient slug={slug} />;
}
