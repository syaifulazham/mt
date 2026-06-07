import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getTranslations } from "next-intl/server";

export async function PublicNav({ locale }: { locale: string }) {
  const { userId } = await auth().catch(() => ({ userId: null }));
  const [manager, t] = await Promise.all([
    userId
      ? db.managerProfile.findUnique({ where: { clerkUserId: userId }, select: { name: true } })
      : Promise.resolve(null),
    getTranslations({ locale, namespace: "landing" }),
  ]);

  const clerkUser = userId && !manager ? await currentUser() : null;
  const displayName =
    clerkUser?.firstName ?? clerkUser?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? null;

  return (
    <nav
      className="fixed top-0 left-0 right-0 flex justify-between items-center z-50 px-8 md:px-16"
      style={{
        height: 64,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 16px rgba(0,0,0,0.06)",
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      <Link href="/" className="flex items-center">
        <Image src="/logo-mt.svg" alt="Malaysia Techlympics" width={140} height={80} priority style={{ height: 38, width: "auto" }} />
      </Link>

      <ul className="hidden md:flex gap-8 list-none m-0 p-0">
        {([
          { key: "navCompetition", href: "/#categories" },
          { key: "navNews",        href: "/#news" },
          { key: "navAnnouncements", href: "/#announcements" },
          { key: "navGallery",     href: "/#gallery" },
        ] as const).map(({ key, href }) => (
          <li key={key}>
            <Link href={href} style={{ color: "#374151", textDecoration: "none", fontSize: "0.82rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-4">
        <LocaleSwitcher />
        <Link href="/organizer/login" className="text-xs text-slate-400 hover:text-slate-700 transition-colors" style={{ letterSpacing: "0.08em" }}>
          {t("staffLogin")}
        </Link>
        {manager ? (
          <Link href="/manager/dashboard">
            <button className="text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full transition-all" style={{ background: "#003893", color: "#fff" }}>
              {t("dashboardButton")}
            </button>
          </Link>
        ) : userId ? (
          <Link href="/manager/onboarding">
            <button className="text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full" style={{ background: "#16a34a", color: "#fff" }}>
              {displayName ?? t("profileFallback")}
            </button>
          </Link>
        ) : (
          <Link href="/manager/sign-up">
            <button className="text-xs font-bold tracking-widest uppercase px-5 py-2 rounded-full" style={{ background: "#CC0001", color: "#fff" }}>
              {t("registerNow")}
            </button>
          </Link>
        )}
      </div>
    </nav>
  );
}
