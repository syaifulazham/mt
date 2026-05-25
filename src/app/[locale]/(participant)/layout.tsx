import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { template: "%s — Techlympics Peserta", default: "Techlympics Peserta" },
};

export default function ParticipantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
