import type { Metadata, Viewport } from "next";
import { MediaCaptureClient } from "@/components/media/MediaCaptureClient";

export const metadata: Metadata = { title: "Media — Galeri", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#db2777" };

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MediaCaptureClient slug={slug} />;
}
