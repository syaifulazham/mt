import { cn } from "@/lib/utils";

/**
 * Standard page wrapper for all manager portal pages.
 * The layout's <main> already provides p-6 — this adds only vertical rhythm.
 * Use narrow={true} for form/card pages that should be constrained to max-w-2xl.
 */
export function ManagerPageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {children}
    </div>
  );
}

/**
 * Standard page title + optional subtitle used at the top of every manager page.
 */
export function ManagerPageHeader({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-xl font-bold dark:text-zinc-100">{title}</h1>
      {subtitle && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
