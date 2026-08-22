import type { Metadata } from "next";
import { PublicFormClient } from "@/components/walkin/PublicFormClient";

export const metadata: Metadata = { title: "Borang Pendaftaran Walk-in" };

export default async function WalkInPublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicFormClient slug={slug} />;
}
