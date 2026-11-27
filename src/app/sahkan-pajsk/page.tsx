import type { Metadata } from "next";
import { PajskVerifyClient } from "@/components/pajsk/PajskVerifyClient";

// Public PAJSK certificate verification. noindex: results concern minors (PDPA).
export const metadata: Metadata = {
  title: "Sahkan Sijil PAJSK — Malaysia Techlympics",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SahkanPajskPage({ searchParams }: { searchParams: Promise<{ kod?: string }> }) {
  const { kod } = await searchParams;
  return <PajskVerifyClient initialCode={typeof kod === "string" ? kod.slice(0, 20) : ""} />;
}
