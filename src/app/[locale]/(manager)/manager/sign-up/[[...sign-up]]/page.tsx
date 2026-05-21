import { getTranslations } from "next-intl/server";
import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create Account" };

export default async function ManagerSignUpPage({
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
          <p className="text-sm text-muted-foreground mt-1">{t("signUpSubtitle")}</p>
        </div>
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-sm border rounded-xl",
            },
          }}
          fallbackRedirectUrl="/manager/onboarding"
          signInUrl="/manager/sign-in"
        />
      </div>
    </div>
  );
}
