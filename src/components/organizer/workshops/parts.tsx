import { cn } from "@/lib/utils";
import type { Breakdown, WorkshopDimension } from "@/lib/workshopStats";

// Pieces shared by the Workshops list and the workshop detail page.

export type CourseMeta = {
  title: string;
  status: string;
  subtitle: string | null;
  instructor: string | null;
  totalMinutes: number | null;
  enrolmentCount: number | null;
};

export const DIMENSIONS: { key: WorkshopDimension; title: string }[] = [
  { key: "state",          title: "By State" },
  { key: "schoolCategory", title: "By School Category" },
  { key: "ethnicity",      title: "By Ethnicity" },
  { key: "gender",         title: "By Gender" },
  { key: "targetGroup",    title: "By Target Group" },
];

const BAR = "#085782";
export const fmt = (n: number) => n.toLocaleString();

export function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className={cn("shrink-0 rounded-lg p-2.5", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-900">
          {typeof value === "number" ? fmt(value) : value}
        </p>
        {sub && <p className="mt-0.5 text-[11px] text-zinc-400">{sub}</p>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "rounded px-1.5 py-px text-[11px] font-medium uppercase",
      status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
    )}>{status}</span>
  );
}

function BreakdownCard({ title, rows, total }: { title: string; rows: Breakdown[WorkshopDimension]; total: number }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b bg-zinc-50/80 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      </div>
      <div className="max-h-80 overflow-y-auto px-4 py-3">
        {rows.length === 0 && <p className="py-4 text-center text-xs text-zinc-400">No participants</p>}
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-1 py-1.5">
            <div className="w-44 shrink-0 truncate text-xs text-zinc-700" title={r.label}>{r.label}</div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: BAR }} />
            </div>
            <div className="w-14 text-right font-mono text-xs tabular-nums text-zinc-600">{fmt(r.count)}</div>
            <div className="w-11 text-right text-[11px] tabular-nums text-zinc-400">
              {total > 0 ? `${((r.count / total) * 100).toFixed(1)}%` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Breakdowns({ breakdown, total }: { breakdown: Breakdown; total: number }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {DIMENSIONS.map((d) => (
        <BreakdownCard key={d.key} title={d.title} rows={breakdown[d.key]} total={total} />
      ))}
    </div>
  );
}
