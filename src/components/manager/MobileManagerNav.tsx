"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Home,
  User,
  Building2,
  Users,
  GraduationCap,
  Swords,
  BookOpen,
  Award,
  Grid3X3,
  LogOut,
  Lock,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function active(pathname: string, href: string) {
  if (href === "/manager/dashboard") {
    return pathname === "/manager" || pathname === "/manager/dashboard";
  }
  return pathname.startsWith(href);
}

// ── bottom bar tab ────────────────────────────────────────────────────────────

function BottomTab({
  href,
  icon: Icon,
  label,
  isActive,
  disabled,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-zinc-200 dark:text-zinc-700 cursor-not-allowed select-none">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
        <span className="text-[10px] font-medium leading-none">{label}</span>
        <Lock className="absolute top-1.5 right-1.5 h-2.5 w-2.5 text-zinc-300 dark:text-zinc-600" />
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
        isActive ? "text-[#085782] dark:text-blue-400" : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {isActive && (
        <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#085782]" />
      )}
    </Link>
  );
}

// ── grid tile (More sheet) ────────────────────────────────────────────────────

function GridTile({
  href,
  icon: Icon,
  label,
  isActive,
  color,
  disabled,
  onClick,
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  isActive?: boolean;
  color: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (disabled) {
    return (
      <div className="relative flex flex-col items-center gap-2 rounded-2xl p-4 opacity-35 cursor-not-allowed select-none">
        <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center shadow-sm`}>
          <Icon className="h-6 w-6 text-white" strokeWidth={1.8} />
        </div>
        <span className="text-xs font-medium text-center leading-tight text-zinc-700">{label}</span>
        <Lock className="absolute top-2 right-2 h-3 w-3 text-zinc-400" />
      </div>
    );
  }

  const content = (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl p-4 transition-all active:scale-95 ${
        isActive
          ? "bg-blue-50 ring-2 ring-[#085782]/40 dark:bg-blue-950/30 dark:ring-blue-400/30"
          : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
      }`}
    >
      <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center shadow-sm`}>
        <Icon className="h-6 w-6 text-white" strokeWidth={1.8} />
      </div>
      <span
        className={`text-xs font-medium text-center leading-tight ${
          isActive ? "text-[#085782] dark:text-blue-400" : "text-zinc-700 dark:text-zinc-300"
        }`}
      >
        {label}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className="block">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full">
      {content}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function MobileManagerNav({ hasContingent }: { hasContingent: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useUser();
  const userName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.username ?? null);

  const primary = [
    { href: "/manager/dashboard",    icon: Home,     label: t("dashboard"),    gated: false },
    { href: "/manager/contingents",  icon: Building2, label: t("contingents"), gated: false },
    { href: "/manager/participants", icon: Users,     label: t("participants"), gated: true  },
    { href: "/manager/teams",        icon: Swords,    label: t("teams"),        gated: true  },
  ];

  const secondary = [
    { href: "/manager/profile",      icon: User,          label: t("profile"),      color: "bg-violet-500", gated: false },
    { href: "/manager/trainers",     icon: GraduationCap, label: t("trainers"),     color: "bg-teal-500",   gated: true  },
    { href: "/manager/lms",          icon: BookOpen,      label: t("lms"),          color: "bg-amber-500",  gated: true  },
    { href: "/manager/certificates", icon: Award,         label: t("certificates"), color: "bg-pink-500",   gated: true  },
  ];

  const moreActive = secondary.some((item) => !item.gated || hasContingent)
    && secondary.some((item) => active(pathname, item.href));

  return (
    <>
      {/* ── Fixed bottom bar ─────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex h-16 items-stretch border-t bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-[0_-2px_12px_rgba(0,0,0,0.07)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.4)]">
        {primary.map((item) => (
          <BottomTab
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            isActive={active(pathname, item.href)}
            disabled={item.gated && !hasContingent}
          />
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
            moreActive ? "text-[#085782] dark:text-blue-400" : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          }`}
        >
          <Grid3X3 className="h-5 w-5" strokeWidth={moreActive ? 2.5 : 1.8} />
          <span className="text-[10px] font-medium leading-none">{t("more")}</span>
          {moreActive && (
            <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#085782]" />
          )}
        </button>
      </nav>

      {/* ── More sheet ───────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-10">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* User chip */}
          {userName && (
            <div className="mx-6 mb-4 flex items-center gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 px-4 py-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #085782, #e75262)" }}
              >
                {userName.charAt(0).toUpperCase()}
              </div>
              <p className="truncate text-sm font-medium">{userName}</p>
            </div>
          )}

          {/* Thumbnail grid */}
          <div className="grid grid-cols-4 gap-3 px-4">
            {secondary.map((item) => (
              <GridTile
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                isActive={active(pathname, item.href)}
                color={item.color}
                disabled={item.gated && !hasContingent}
                onClick={() => setMoreOpen(false)}
              />
            ))}

            <GridTile
              icon={LogOut}
              label={t("signOut")}
              color="bg-[#e75262]"
              onClick={() => { window.location.href = "/api/auth/signout"; }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
