import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { navForRole } from "@/components/organizer/nav";
import { PinnedEventsList } from "@/components/organizer/events/PinnedEventsList";

export const metadata: Metadata = { title: "Home" };

export default async function OrganizerHomePage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const items = navForRole(session.role);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Welcome, {session.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything in the Organizer Portal, in one place. Pick a section to get started.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            // Parent groups may not have a page of their own; open the first sub-page.
            const href = item.children?.[0]?.href ?? item.href;

            return (
              <div
                key={item.href}
                className="group flex flex-col rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <Link href={href} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-semibold text-zinc-900">
                      {item.label}
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-1 block text-sm text-zinc-500">{item.description}</span>
                  </span>
                </Link>

                {item.href === "/organizer/events" && <PinnedEventsList />}

                {item.children && (
                  <ul className="mt-4 space-y-0.5 border-t pt-3">
                    {item.children.map((child) => {
                      const CIcon = child.icon;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                          >
                            <CIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            <span className="font-medium">{child.label}</span>
                            <span className="hidden truncate text-xs text-zinc-400 md:inline">
                              — {child.description}
                            </span>
                            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-300" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </OrganizerShell>
  );
}
