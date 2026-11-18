"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2, Circle, Download, Loader2, School, Search, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Manager portal → Sijil → School / Contingent Level Cert (src/lib/certificates/general.ts).
// Competitions on the left; picking one lists its eligible participants, with
// those registered or taking part in it at any level ticked by default. The
// selection is issued in chunks so every name's progress shows; optionally the
// new certificates are merged into one PDF and downloaded when done.

type Participant = { id: string; name: string; classLabel: string | null; registered: boolean; via: string[]; certificateId: string | null };
type Competition = { id: string; code: string; name: string; participants: Participant[] };
export type GeneralData = { available: false } | { available: true; school: boolean; templateName: string; competitions: Competition[] };
type ItemStatus = "QUEUED" | "CREATED" | "EXISTING" | "FAILED";
type Run = {
  phase: "ISSUING" | "PDF" | "DONE";
  items: { id: string; name: string; status: ItemStatus; certificateId: string | null }[];
  pdfError?: string;
};

export const GENERAL_API = "/api/v2/manager/certificates/general";
const CHUNK = 10; // GENERAL_CHUNK

async function downloadPdf(ids: string[]) {
  const res = await fetch(`${GENERAL_API}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Sijil.pdf";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const defaultPick = (c: Competition) => new Set(c.participants.filter(p => p.registered && !p.certificateId).map(p => p.id));

export function ManagerSchoolLevelCertClient() {
  const t = useTranslations("managerCertificates");
  const [data, setData] = useState<GeneralData | null>(null);
  const [compId, setCompId] = useState("");
  const [compQ, setCompQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [withPdf, setWithPdf] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(GENERAL_API, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive) setData(j.available ? j : { available: false }); })
      .catch(() => { if (alive) setData({ available: false }); });
    return () => { alive = false; };
  }, [reload]);

  const competitions = useMemo(() => (data?.available ? data.competitions : []), [data]);
  const comp = competitions.find(c => c.id === compId);
  const shownComps = useMemo(() => {
    const q = compQ.trim().toLowerCase();
    return q ? competitions.filter(c => `${c.code} ${c.name}`.toLowerCase().includes(q)) : competitions;
  }, [competitions, compQ]);
  const open = comp?.participants.filter(p => !p.certificateId) ?? [];
  const busy = run?.phase === "ISSUING" || run?.phase === "PDF";

  function pickComp(c: Competition) {
    if (busy) return;
    setCompId(c.id); setPicked(defaultPick(c)); setRun(null); setErr("");
  }
  function toggle(id: string) {
    setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function generate() {
    if (!comp) return;
    const chosen = comp.participants.filter(p => picked.has(p.id) && !p.certificateId);
    let items: Run["items"] = chosen.map(p => ({ id: p.id, name: p.name, status: "QUEUED", certificateId: null }));
    setErr(""); setRun({ phase: "ISSUING", items });
    try {
      for (let i = 0; i < chosen.length; i += CHUNK) {
        const ids = chosen.slice(i, i + CHUNK).map(p => p.id);
        const res = await fetch(GENERAL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitionId: comp.id, participantIds: ids }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        const by = new Map<string, { status: string; certificateId: string | null }>(
          (j.results ?? []).map((r: { participantId: string; status: string; certificateId: string | null }) => [r.participantId, r]));
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
    }
  }

  const done = run?.items.filter(i => i.status !== "QUEUED").length ?? 0;
  const created = run?.items.filter(i => i.status === "CREATED") ?? [];
  const existing = run?.items.filter(i => i.status === "EXISTING").length ?? 0;
  const failed = run?.items.filter(i => i.status === "FAILED").length ?? 0;
  const pct = run ? (run.phase === "ISSUING" ? Math.round((done / Math.max(1, run.items.length)) * 100) : 100) : 0;

  const STATUS: Record<ItemStatus, { label: string; icon: React.ReactNode; cls: string }> = {
    QUEUED:   { label: t("statusQueued"),   icon: <Circle className="h-3.5 w-3.5" />,       cls: "text-zinc-400" },
    CREATED:  { label: t("statusCreated"),  icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-emerald-600" },
    EXISTING: { label: t("statusExisting"), icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-zinc-500" },
    FAILED:   { label: t("statusFailed"),   icon: <XCircle className="h-3.5 w-3.5" />,      cls: "text-red-600" },
  };

  const header = (
    <div className="space-y-2">
      <Link href="/manager/certificates" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-600">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"><School className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-wide dark:text-zinc-100">
            {data?.available && !data.school ? t("generalTitleContingent") : t("generalTitleSchool")}
          </h1>
          <p className="max-w-3xl text-sm text-zinc-500">{t("generalIntro")}</p>
          {data?.available && <p className="mt-0.5 text-[11px] text-zinc-400">{t("generalTemplate", { name: data.templateName })}</p>}
        </div>
      </div>
    </div>
  );

  if (data === null)
    return <div className="space-y-4">{header}<div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div></div>;
  if (!data.available)
    return (
      <div className="space-y-4">{header}
        <div className="rounded-2xl border bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold dark:text-zinc-100">{t("notDistributedTitle")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">{t("notDistributedBody")}</p>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      {header}
      {competitions.length === 0 ? (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">{t("noCompetitions")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* ── Competitions ───────────────────────────────────────────────── */}
          <aside className="min-w-0 rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto">
            <div className="border-b p-2 dark:border-zinc-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input id="general-comp-search" value={compQ} onChange={e => setCompQ(e.target.value)} placeholder={t("searchCompetition")}
                  className="h-9 w-full rounded-md border bg-white pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700 dark:bg-zinc-900" />
              </div>
            </div>
            <div className="space-y-0.5 p-1.5">
              {shownComps.map(c => {
                const reg = c.participants.filter(p => p.registered).length;
                const iss = c.participants.filter(p => p.certificateId).length;
                return (
                  <button key={c.id} type="button" onClick={() => pickComp(c)} disabled={busy} aria-current={c.id === compId}
                    className={cn("flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed",
                      c.id === compId ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40")}>
                    <span className="w-11 shrink-0 pt-0.5 font-mono text-[11px] text-zinc-500">{c.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">{c.name}</span>
                      <span className="block text-[11px] text-zinc-500">
                        {t("competitionCounts", { registered: reg, eligible: c.participants.length, issued: iss })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Participants + generate ────────────────────────────────────── */}
          <section className="min-w-0 space-y-3">
            {!comp ? (
              <div className="flex h-60 items-center justify-center rounded-xl border bg-white px-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                {t("pickCompetitionHint")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="space-y-2 border-b px-4 py-3 dark:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"><span className="font-mono text-zinc-500">{comp.code}</span> {comp.name}</p>
                  <p className="text-[11px] text-zinc-500">{t("defaultCheckedNote")}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" disabled={busy || open.length === 0} onClick={() => setPicked(new Set(open.map(p => p.id)))}
                      className="rounded-md border px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">{t("selectAll")}</button>
                    <button type="button" disabled={busy} onClick={() => setPicked(defaultPick(comp))}
                      className="rounded-md border px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">{t("selectRegistered")}</button>
                    <button type="button" disabled={busy || picked.size === 0} onClick={() => setPicked(new Set())}
                      className="rounded-md px-2 py-1 text-zinc-500 hover:text-zinc-800 disabled:opacity-40">{t("clearSelection")}</button>
                    <span className="ml-auto text-zinc-500">{t("selectedCount", { count: picked.size })}</span>
                  </div>
                </div>
                <div className="max-h-[55vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-50 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
                      <tr>
                        <th className="w-10 px-3 py-2" />
                        <th className="px-3 py-2 text-left">{t("colName")}</th>
                        <th className="px-3 py-2 text-left">{t("colClass")}</th>
                        <th className="px-3 py-2 text-left">{t("colTakingPart")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-zinc-800">
                      {comp.participants.map(p => {
                        const issued = !!p.certificateId;
                        return (
                          <tr key={p.id} onClick={() => !issued && !busy && toggle(p.id)}
                            className={cn(issued ? "text-zinc-400" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                              picked.has(p.id) && "bg-emerald-50/70 dark:bg-emerald-950/30")}>
                            <td className="px-3 py-2">
                              <input type="checkbox" aria-label={p.name} checked={issued || picked.has(p.id)} disabled={issued || busy}
                                onChange={() => toggle(p.id)} onClick={e => e.stopPropagation()} className="h-4 w-4 accent-emerald-600" />
                            </td>
                            <td className="px-3 py-2 font-medium">{p.name}</td>
                            <td className="px-3 py-2 text-xs text-zinc-500">{p.classLabel ?? "—"}</td>
                            <td className="px-3 py-2 text-xs">
                              <span className="flex flex-wrap items-center gap-1">
                                {p.registered
                                  ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40">{t("registeredBadge")}</span>
                                  : <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 dark:bg-zinc-800">{t("eligibleOnly")}</span>}
                                {p.via.length > 0 && <span className="truncate text-zinc-500">{p.via.join(", ")}</span>}
                                {issued && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">{t("alreadyIssued")}</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 dark:border-zinc-800">
                  <button type="button" onClick={generate} disabled={busy || picked.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t("generate", { count: picked.size })}
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <input id="general-with-pdf" type="checkbox" checked={withPdf} onChange={e => setWithPdf(e.target.checked)} disabled={busy} className="accent-emerald-600" />
                    {t("downloadWhenDone")}
                  </label>
                </div>
              </div>
            )}

            {run && (
              <div className="space-y-2 rounded-xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
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
                <ul className="grid max-h-56 gap-x-4 gap-y-0.5 overflow-y-auto text-xs sm:grid-cols-2 xl:grid-cols-3">
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
            {err && <p className="text-xs text-red-600">{err}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
