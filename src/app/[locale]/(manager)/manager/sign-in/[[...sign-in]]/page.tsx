import { getTranslations } from "next-intl/server";
import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign In" };

export default async function ManagerSignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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
          afterSignInUrl="/manager/dashboard"
          signUpUrl="/manager/sign-up"
        />
      </div>
    </div>
  );
}
