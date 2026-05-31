import { getTranslations } from "next-intl/server";
import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In" };

export default async function ManagerSignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { userId } = await auth();
  if (userId) redirect("/manager/dashboard");

  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="space-y-4 text-center">
        <div>
          <h1 className="text-2xl font-bold">{t("managerPortalTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("signInSubtitle")}</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-sm border rounded-xl",
            },
          }}
          fallbackRedirectUrl="/manager/dashboard"
          signUpUrl="/manager/sign-up"
        />

        {/* Fallback — when Clerk widget fails to render */}
        <div className="pt-2 space-y-2">
          {/* Primary: go to working Account Portal sign-in */}
          <a
            href="https://accounts.techlympics.my/sign-in"
            className="block w-full rounded-lg bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2.5 text-center transition-colors"
          >
            Log Masuk →
          </a>
          <p className="text-xs text-zinc-400 text-center">Sudah log masuk?</p>
          <Link
            href="/manager/dashboard"
            className="block w-full rounded-lg border border-zinc-300 hover:bg-zinc-100 text-zinc-700 text-sm font-medium px-4 py-2.5 text-center transition-colors"
          >
            Pergi ke Dashboard →
          </Link>
          <Link
            href="/manager/onboarding"
            className="block w-full rounded-lg border border-zinc-300 hover:bg-zinc-100 text-zinc-700 text-sm font-medium px-4 py-2.5 text-center transition-colors"
          >
            Lengkapkan Pendaftaran →
          </Link>
        </div>
      </div>
    </div>
  );
}
