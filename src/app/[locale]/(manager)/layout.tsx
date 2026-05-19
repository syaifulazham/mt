import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { MobileManagerNav } from "@/components/manager/MobileManagerNav";

export const metadata: Metadata = {
  title: { template: "%s — Techlympics Manager", default: "Techlympics Manager" },
};

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const userName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.username ?? null);

  return (
    <ClerkProvider>
      {children}
      <MobileManagerNav userName={userName} />
    </ClerkProvider>
  );
}
