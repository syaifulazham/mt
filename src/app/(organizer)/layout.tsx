import type { Metadata } from "next";
import { SessionProvider } from "@/components/organizer/SessionProvider";

export const metadata: Metadata = {
  title: { template: "%s — Techlympics Organizer", default: "Techlympics Organizer" },
};

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
