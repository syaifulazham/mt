"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, Download, Loader2, School, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Manager portal → Sijil → School / Contingent Level Cert (src/lib/certificates/general.ts).
// Pick a competition, tick participants, generate. The selection is sent in
// chunks so every name's progress shows; optionally the new certificates are
// merged into one PDF and downloaded when done. Issued certificates appear
// under Peringkat Sekolah in the participants table (onIssued reloads it).

type Participant = { id: string; name: string; certificateId: string | null };
type Competition = { id: string; code: string; name: string; participants: Participant[] };
type Data = { available: false } | { available: true; school: boolean; templateName: string; competitions: Competition[] };
type ItemStatus = "QUEUED" | "CREATED" | "EXISTING" | "FAILED";
type Run = {
  phase: "ISSUING" | "PDF" | "DONE";
  items: { id: string; name: string; status: ItemStatus; certificateId: string | null }[];
  pdfError?: string;
};

const API = "/api/v2/manager/certificates/general";
const CHUNK = 10; // GENERAL_CHUNK

async function downloadPdf(ids: string[]) {
  const res = await fetch(`${API}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Sijil.pdf";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ManagerGeneralCertSection({ onIssued }: { onIssued: () => void }) {
  const t = useTranslations("managerCertificates");
  const [data, setData] = useState<Data | null>(null);
  const [compId, setCompId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [withPdf, setWithPdf] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(API, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive) setData(j.available ? j : { available: false }); })
      .catch(() => { if (alive) setData({ available: false }); });
    return () => { alive = false; };
  }, [reload]);

  const comp = useMemo(() => (data?.available ? data.competitions.find(c => c.id === compId) : undefined), [data, compId]);
  const open = comp?.participants.filter(p => !p.certificateId) ?? [];
  const busy = run?.phase === "ISSUING" || run?.phase === "PDF";

  if (!data?.available) return null;

  function pickComp(id: string) { setCompId(id); setPicked(new Set()); setRun(null); setErr(""); }
  function toggle(id: string) {
    setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function generate() {
    if (!comp) return;
    const chosen = comp.participants.filter(p => picked.has(p.id));
    let items: Run["items"] = chosen.map(p => ({ id: p.id, name: p.name, status: "QUEUED", certificateId: null }));
    setErr(""); setRun({ phase: "ISSUING", items });
    try {
      for (let i = 0; i < chosen.length; i += CHUNK) {
        const ids = chosen.slice(i, i + CHUNK).map(p => p.id);
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitionId: comp.id, participantIds: ids }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        const by = new Map<string, { status: string; certificateId: string | null }>((j.results ?? []).map((r: { participantId: string; status: string; certificateId: string | null }) => [r.participantId, r]));
        items = items.map(it => {
          const r = by.get(it.id);
          if (!r) return it;
          const status: ItemStatus = r.status === "CREATED" ? "CREATED" : r.status === "EXISTING" ? "EXISTING" : "FAILED";
          return { ...it, status, certificateId: r.certificateId };
        });
        setRun({ phase: "ISSUING", items });
      }
      const newIds = items.filter(it => it.status === "CREATED" && it.certificateId).map(it => it.certificateId!);
      let pdfError: string | undefined;
      if (withPdf && newIds.length) {
        setRun({ phase: "PDF", items });
        try { await downloadPdf(newIds); } catch (e) { pdfError = e instanceof Error ? e.message : t("pdfFailed"); }
      }
      setRun({ phase: "DONE", items, pdfError });
      setPicked(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("downloadFailed"));
      setRun(r => (r ? { ...r, phase: "DONE" } : r));
    } finally {
      setReload(x => x + 1);
      onIssued();
    }
  }

  const done = run?.items.filter(i => i.status !== "QUEUED").length ?? 0;
  const created = run?.items.filter(i => i.status === "CREATED") ?? [];
  const existing = run?.items.filter(i => i.status === "EXISTING").length ?? 0;
  const failed = run?.items.filter(i => i.status === "FAILED").length ?? 0;
  const pct = run ? (run.phase === "ISSUING" ? Math.round((done / Math.max(1, run.items.length)) * 100) : 100) : 0;

  const STATUS: Record<ItemStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    QUEUED:   { label: t("statusQueued"),   icon: <Circle className="h-3.5 w-3.5" />,                cls: "text-zinc-400" },
    CREATED:  { label: t("statusCreated"),  icon: <CheckCircle2 className="h-3.5 w-3.5" />,          cls: "text-emerald-600" },
    EXISTING: { label: t("statusExisting"), icon: <CheckCircle2 className="h-3.5 w-3.5" />,          cls: "text-zinc-500" },
    FAILED:   { label: t("statusFailed"),   icon: <XCircle className="h-3.5 w-3.5" />,               cls: "text-red-600" },
  };

  return (
    <section className="space-y-3 rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"><School className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold tracking-wide text-zinc-900 dark:text-zinc-100">{data.school ? t("generalTitleSchool") : t("generalTitleContingent")}</h2>
          <p className="max-w-3xl text-xs text-zinc-500">{t("generalIntro")}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">{t("generalTemplate", { name: data.templateName })}</p>
        </div>
      </div>

      {data.competitions.length === 0 ? (
        <p className="text-xs text-zinc-400">{t("noCompetitions")}</p>
      ) : (
        <div className="space-y-3">
          <select value={compId} onChange={e => pickComp(e.target.value)} disabled={busy}
            className="h-9 w-full max-w-xl rounded-md border bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700 dark:bg-zinc-900">
            <option value="">{t("selectCompetition")}</option>
            {data.competitions.map(c => (
              <option key={c.id} value={c.id}>{c.code} {c.name} — {t("participantsIn", { count: c.participants.length })}</option>
            ))}
          </select>

          {comp && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button type="button" disabled={busy || open.length === 0} onClick={() => setPicked(new Set(open.map(p => p.id)))}
                  className="rounded-md border px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  {t("selectAll")}
                </button>
                <button type="button" disabled={busy || picked.size === 0} onClick={() => setPicked(new Set())}
                  className="rounded-md px-2 py-1 text-zinc-500 hover:text-zinc-800 disabled:opacity-40">{t("clearSelection")}</button>
                <span className="text-zinc-500">{t("selectedCount", { count: picked.size })}</span>
              </div>
              <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800">
                {comp.participants.map(p => {
                  const issued = !!p.certificateId;
                  return (
                    <label key={p.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      issued ? "text-zinc-400" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                      picked.has(p.id) && "bg-emerald-50 dark:bg-emerald-950/30")}>
                      <input type="checkbox" checked={issued || picked.has(p.id)} disabled={issued || busy} onChange={() => toggle(p.id)}
                        className="h-4 w-4 accent-emerald-600" />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {issued && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">{t("alreadyIssued")}</span>}
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={generate} disabled={busy || picked.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {t("generate", { count: picked.size })}
                </button>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <input type="checkbox" checked={withPdf} onChange={e => setWithPdf(e.target.checked)} disabled={busy} className="accent-emerald-600" />
                  {t("downloadWhenDone")}
                </label>
              </div>
            </>
          )}

          {run && (
            <div className="space-y-2 rounded-lg border bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div className={cn("h-full rounded-full transition-all duration-300", run.phase === "PDF" ? "animate-pulse bg-sky-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {run.phase === "ISSUING" && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("stepIssuing", { done, total: run.items.length })}</span>}
                {run.phase === "PDF" && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("stepPdf", { count: created.length })}</span>}
                {run.phase === "DONE" && <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {t("stepDone", { created: created.length, existing })}</span>}
                {failed > 0 && <span className="text-red-600">{t("stepFailed", { count: failed })}</span>}
                {run.pdfError && <span className="text-red-600">{t("pdfFailed")}: {run.pdfError}</span>}
                {run.phase === "DONE" && created.length > 0 && (
                  <button type="button" onClick={() => downloadPdf(created.map(c => c.certificateId!)).catch(e => setErr(e instanceof Error ? e.message : t("pdfFailed")))}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700">
                    <Download className="h-3.5 w-3.5" /> {t("downloadGenerated", { count: created.length })}
                  </button>
                )}
              </p>
              <ul className="grid max-h-48 gap-x-4 gap-y-0.5 overflow-y-auto text-xs sm:grid-cols-2 lg:grid-cols-3">
                {run.items.map(it => (
                  <li key={it.id} className="flex items-center gap-1.5">
                    <span className={STATUS[it.status].cls}>{STATUS[it.status].icon}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{it.name}</span>
                    <span className={cn("shrink-0 text-[10px]", STATUS[it.status].cls)}>{STATUS[it.status].label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </section>
  );
}
