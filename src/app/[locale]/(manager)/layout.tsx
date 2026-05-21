import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { MobileManagerNav } from "@/components/manager/MobileManagerNav";

export const metadata: Metadata = {
  title: { template: "%s — Techlympics Manager", default: "Techlympics Manager" },
};

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {children}
      <MobileManagerNav />
    </ClerkProvider>
  );
}
