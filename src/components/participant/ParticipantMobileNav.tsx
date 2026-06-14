"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Swords, Trophy, BookOpen, Award, MessageCircle } from "lucide-react";

const NAV = [
  { href: "/participant/profile",      icon: User,          label: "Profil" },
  { href: "/participant/team",         icon: Swords,        label: "Pasukan" },
  { href: "/participant/competitions", icon: Trophy,        label: "Pertandingan" },
  { href: "/participant/bengkel",      icon: BookOpen,      label: "Bengkel" },
  { href: "/participant/certificates", icon: Award,         label: "Sijil" },
  { href: "/participant/chat",         icon: MessageCircle, label: "AI Rimau" },
] as const;

export function ParticipantMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex h-16 items-stretch border-t shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
      style={{
        background:     "var(--pt-surface, white)",
        borderTopColor: "var(--pt-border-color, #e4e4e7)",
      }}
    >
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors"
            style={{ color: active ? "var(--pt-active-text, #085782)" : undefined }}
          >
            {!active && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-zinc-400 dark:text-zinc-500" />
            )}
            <Icon
              className="h-5 w-5"
              style={{ color: active ? "var(--pt-active-text, #085782)" : undefined }}
              strokeWidth={active ? 2.5 : 1.8}
            />
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: active ? "var(--pt-active-text, #085782)" : undefined }}
            >
              {label}
            </span>
            {active && (
              <span
                className="pt-tab-indicator absolute bottom-0 w-8 h-0.5 rounded-full"
                style={{ background: "var(--pt-active-border, #085782)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
