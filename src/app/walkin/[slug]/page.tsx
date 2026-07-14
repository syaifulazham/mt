import type { Metadata } from "next";
import { CounterRegistrationClient } from "@/components/walkin/CounterRegistrationClient";

export const metadata: Metadata = { title: "Walk-in Registration" };

export default async function WalkInCounterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CounterRegistrationClient slug={slug} />;
}
