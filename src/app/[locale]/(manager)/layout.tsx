import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: { template: "%s — Techlympics Manager", default: "Techlympics Manager" },
};

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {children}
    </ClerkProvider>
  );
}
