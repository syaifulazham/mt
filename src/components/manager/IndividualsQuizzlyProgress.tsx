"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { QuizzlyCell } from "@/lib/quizzlyCell";

/**
 * Asia Spark columns for the manager Individuals page.
 *
 * The page itself renders from mt's database alone; this island makes one
 * request after first paint and fills every Asia Spark cell on the page from
 * it, so Quizzly's latency never delays the roster.
 */

type Data = Record<string, Record<string, QuizzlyCell>>;
type State = { data: Data | null; loading: boolean; failed: boolean };

const Ctx = createContext<State>({ data: null, loading: false, failed: false });

export function QuizzlyProgressProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<State>({ data: null, loading: enabled, failed: false });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/v2/manager/individuals/quizzly-progress")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
        if (!cancelled) setState({ data: json.data ?? {}, loading: false, failed: false });
      })
      .catch(() => { if (!cancelled) setState({ data: null, loading: false, failed: true }); });
    return () => { cancelled = true; };
  }, [enabled]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

const TOKEN_STYLE: Record<string, string> = {
  active:        "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  not_yet_valid: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400",
  redeemed:      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  expired:       "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  revoked:       "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

const PROGRESS_STYLE: Record<string, string> = {
  not_started: "text-zinc-400",
  logged_in:   "text-sky-600 dark:text-sky-400",
  in_progress: "text-amber-600 dark:text-amber-400",
  submitted:   "text-green-600 dark:text-green-400",
  voided:      "text-red-500 dark:text-red-400",
};

function useCell(ecId: string, participantId: string) {
  const { data, loading, failed } = useContext(Ctx);
  return { cell: data?.[ecId]?.[participantId] ?? null, loading, failed };
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-zinc-400">{children}</span>;
}

/** Codes issued for this competition, and the state of the one that matters. */
export function QuizzlyTokenCell({ ecId, participantId }: { ecId: string; participantId: string }) {
  const t = useTranslations("individuals.quizzly");
  const { cell, loading } = useCell(ecId, participantId);
  if (loading) return <Muted>…</Muted>;
  if (!cell || cell.state === "unknown") return <Muted>—</Muted>;
  if (cell.state === "no_account") return <Muted>{t("noAccount")}</Muted>;
  if (cell.state === "no_token") return <Muted>{t("noToken")}</Muted>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-300">{cell.tokensIssued}</span>
      <span className={`rounded-full px-1.5 py-px text-[10px] ${TOKEN_STYLE[cell.currentStatus] ?? TOKEN_STYLE.redeemed}`}>
        {t(`token.${cell.currentStatus}`)}
      </span>
    </span>
  );
}

/** How far the attempt has got: state plus answered / total questions. */
export function QuizzlyProgressCell({ ecId, participantId }: { ecId: string; participantId: string }) {
  const t = useTranslations("individuals.quizzly");
  const { cell, loading } = useCell(ecId, participantId);
  if (loading) return <Muted>…</Muted>;
  if (!cell || cell.state !== "ok") return <Muted>—</Muted>;
  const pct = cell.totalQuestions > 0 ? Math.round((cell.answered / cell.totalQuestions) * 100) : 0;
  return (
    <div className="min-w-0" title={cell.quizTitle}>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className={`truncate font-medium ${PROGRESS_STYLE[cell.progress] ?? ""}`}>{t(`progress.${cell.progress}`)}</span>
        {cell.totalQuestions > 0 && (
          <span className="shrink-0 tabular-nums text-zinc-500">{cell.answered}/{cell.totalQuestions}</span>
        )}
      </div>
      {cell.totalQuestions > 0 && (
        <div className="mt-0.5 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${cell.progress === "submitted" ? "bg-green-500" : "bg-amber-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Per-competition roll-up for teachers: given a token, finished answering. */
export function QuizzlySummary({ ecId, participantIds }: { ecId: string; participantIds: string[] }) {
  const t = useTranslations("individuals.quizzly");
  const { data, loading, failed } = useContext(Ctx);
  if (loading) return <Muted>{t("loading")}</Muted>;
  if (failed || !data) return <Muted>{t("unavailable")}</Muted>;
  const cells = participantIds.map((id) => data[ecId]?.[id]);
  const tokened   = cells.filter((c) => c?.state === "ok").length;
  const submitted = cells.filter((c) => c?.state === "ok" && c.progress === "submitted").length;
  return (
    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
      {t("summary", { tokened, submitted, total: participantIds.length })}
    </span>
  );
}
