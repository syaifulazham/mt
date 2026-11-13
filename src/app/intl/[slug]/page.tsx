import type { Metadata, Viewport } from "next";
import { InternationalLinkClient } from "@/components/organizer/events/InternationalLinkClient";

export const metadata: Metadata = { title: "Pendaftaran Antarabangsa", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0284c7" };

// A third-party registration link: an event's Penyertaan Antarabangsa page for whoever holds the passcode.
export default async function InternationalLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <InternationalLinkClient slug={slug} />;
}
