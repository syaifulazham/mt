"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Lock, Search, Star, Vote, X } from "lucide-react";

// Public voting page (/vote/<slug>): review each entry's links and give it a
// score between the session's min and max. Scores save as they are tapped and
// can be changed while voting is open (one ballot per entry per device).

type Link = { label: string; url: string };
type Entry = { id: string; title: string; subtitle: string | null; links: Link[]; votes?: number; average?: number | null };
type Data = {
  session: {
    label: string; description: string | null; minScore: number; maxScore: number;
    status: string; showResults: boolean; event: string;
    competition: { code: string; name: string; splitLabel: string };
  };
  entries: Entry[];
  mine: Record<string, number>;
};

/** Ranges up to this many values get one button per score; larger ones get a slider. */
const MAX_BUTTONS = 11;

const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700;900&family=Rajdhani:wght@500;600;700&display=swap');
.vt-exo{font-family:'Exo 2',sans-serif}.vt-raj{font-family:'Rajdhani',sans-serif}`;

export function VoteClient({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [mine, setMine] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/vote/${slug}`, { cache: "no-store" });
      if (res.status === 404) { setStatus("notfound"); return; }
      if (!res.ok) throw new Error();
      const d = (await res.json()) as Data;
      setData(d); setMine(d.mine); setStatus("ready");
    } catch { setStatus(s => (s === "ready" ? s : "error")); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  // Live averages when the organizer shows them; otherwise only the open/closed state matters.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, data?.session.showResults ? 15_000 : 60_000);
    return () => clearInterval(t);
  }, [load, data?.session.showResults]);

  async function vote(entryId: string, score: number) {
    const prev = mine[entryId];
    setMine(m => ({ ...m, [entryId]: score }));
    setSaving(s => ({ ...s, [entryId]: true }));
    setErr(e => ({ ...e, [entryId]: "" }));
    try {
      const res = await fetch(`/api/vote/${slug}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, score }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Gagal menyimpan");
      setSaved(s => ({ ...s, [entryId]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [entryId]: false })), 1500);
      if (res.status === 403) load();
    } catch (e) {
      setMine(m => { const n = { ...m }; if (prev === undefined) delete n[entryId]; else n[entryId] = prev; return n; });
      setErr(x => ({ ...x, [entryId]: e instanceof Error ? e.message : "Gagal menyimpan" }));
      load();
    } finally { setSaving(s => ({ ...s, [entryId]: false })); }
  }

  const entries = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data) return [];
    return term ? data.entries.filter(e => `${e.title} ${e.subtitle ?? ""}`.toLowerCase().includes(term)) : data.entries;
  }, [data, q]);

  const shell = (child: React.ReactNode) => (
    <div className="vt-raj min-h-screen bg-gradient-to-br from-[#1e0b4b] via-[#3b0f7a] to-[#12052e] text-white">
      <style>{FONT_CSS}</style>
      {child}
    </div>
  );

  if (status === "loading") return shell(<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-300" /></div>);
  if (status === "notfound" || status === "error" || !data) return shell(
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Vote className="h-10 w-10 text-violet-300" />
      <p className="vt-exo text-xl font-bold">{status === "notfound" ? "Pautan undian tidak dijumpai" : "Tidak dapat memuatkan undian"}</p>
      {status === "error" && <button onClick={load} className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Cuba lagi</button>}
    </div>,
  );

  const s = data.session;
  const open = s.status === "ACTIVE";
  const done = data.entries.filter(e => mine[e.id] !== undefined).length;
  const span = s.maxScore - s.minScore + 1;
  const comp = `${s.competition.code} ${s.competition.name}${s.competition.splitLabel ? ` — ${s.competition.splitLabel}` : ""}`;

  return shell(
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">{s.event}</p>
        <h1 className="vt-exo mt-2 text-3xl font-black sm:text-4xl">{s.label}</h1>
        <p className="mt-1 text-sm text-violet-200">{comp}</p>
        {s.description && <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-base text-violet-100/90">{s.description}</p>}
      </header>

      <div className="sticky top-0 z-10 -mx-4 mt-6 border-b border-white/10 bg-[#24095a]/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-violet-300" />
            <input
              value={q} onChange={e => setQ(e.target.value)} placeholder="Cari penyertaan…"
              className="w-full rounded-full border border-white/15 bg-white/10 py-2 pl-9 pr-8 text-sm text-white placeholder:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-2.5 text-violet-300"><X className="h-4 w-4" /></button>}
          </div>
          <div className="shrink-0 text-right">
            <p className="vt-exo text-lg font-bold leading-none">{done}<span className="text-violet-300">/{data.entries.length}</span></p>
            <p className="text-[11px] uppercase tracking-wider text-violet-300">diundi</p>
          </div>
        </div>
        {open
          ? <p className="mt-2 text-center text-xs text-violet-200">Beri skor {s.minScore} (terendah) hingga {s.maxScore} (tertinggi). Skor disimpan serta-merta dan boleh ditukar.</p>
          : <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-amber-300"><Lock className="h-4 w-4" /> Undian telah ditutup.</p>}
      </div>

      {data.entries.length === 0 && <p className="mt-12 text-center text-violet-200">Tiada penyertaan untuk diundi lagi.</p>}
      {data.entries.length > 0 && entries.length === 0 && <p className="mt-12 text-center text-violet-200">Tiada penyertaan sepadan.</p>}

      <ul className="mt-5 space-y-4">
        {entries.map(e => {
          const my = mine[e.id];
          return (
            <li key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-lg sm:p-5">
              <div className="flex items-start gap-3">
                <span className="vt-exo flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-sm font-bold text-teal-200">{data.entries.indexOf(e) + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="vt-exo text-lg font-bold leading-tight">{e.title}</p>
                  {e.subtitle && <p className="text-sm text-violet-200">{e.subtitle}</p>}
                </div>
                {s.showResults && (
                  <div className="shrink-0 text-right">
                    <p className="vt-exo flex items-center justify-end gap-1 text-lg font-bold text-amber-300"><Star className="h-4 w-4 fill-amber-300" />{e.average ?? "–"}</p>
                    <p className="text-[11px] text-violet-300">{e.votes ?? 0} undian</p>
                  </div>
                )}
              </div>

              <PageSnapshot url={e.links[0].url} label={e.title} />

              {e.links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.links.map((l, k) => (
                    <a key={k} href={l.url} target="_blank" rel="noopener noreferrer nofollow"
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-violet-50 hover:bg-white/20">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.label}</span>
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-4">
                {span <= MAX_BUTTONS ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: span }, (_, k) => s.minScore + k).map(v => (
                      <button
                        key={v} disabled={!open} onClick={() => vote(e.id, v)}
                        className={`vt-exo h-10 min-w-10 flex-1 rounded-lg text-base font-bold transition-colors disabled:cursor-not-allowed ${
                          my === v ? "bg-amber-400 text-[#2a0a5e]" : my !== undefined && v < my ? "bg-amber-400/25 text-amber-100" : "bg-white/10 text-white hover:bg-white/20"
                        } ${!open && my !== v ? "opacity-50" : ""}`}
                      >{v}</button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={s.minScore} max={s.maxScore} disabled={!open}
                      defaultValue={my ?? Math.round((s.minScore + s.maxScore) / 2)}
                      onPointerUp={ev => vote(e.id, Number((ev.target as HTMLInputElement).value))}
                      onKeyUp={ev => vote(e.id, Number((ev.target as HTMLInputElement).value))}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="vt-exo w-14 text-right text-2xl font-black text-amber-300">{my ?? "–"}</span>
                  </div>
                )}
                <div className="mt-1.5 h-4 text-xs">
                  {saving[e.id] ? <span className="text-violet-300">Menyimpan…</span>
                    : err[e.id] ? <span className="text-rose-300">{err[e.id]}</span>
                    : saved[e.id] ? <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="h-3 w-3" /> Disimpan</span>
                    : my !== undefined ? <span className="text-violet-300">Skor anda: {my}</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>,
  );
}

/** The page is drawn at a desktop size, then scaled down to the card's width. */
const SNAP_W = 1280, SNAP_H = 800;

/**
 * Live snapshot of an entry's page: a sandboxed, non-interactive iframe scaled
 * to fit, loaded only as the card nears the screen. Tapping it opens the page.
 */
function PageSnapshot({ url, label }: { url: string; label: string }) {
  const box = useRef<HTMLAnchorElement>(null);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "600px 0px" });
    ro.observe(el); io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  return (
    <a
      ref={box} href={url} target="_blank" rel="noopener noreferrer nofollow"
      className="group relative mt-3 block overflow-hidden rounded-xl border border-white/15 bg-white/5"
      style={{ aspectRatio: `${SNAP_W} / ${SNAP_H}` }}
      title={`Buka ${url}`}
    >
      {near && width > 0 && (
        <iframe
          src={url} title={label} loading="lazy" tabIndex={-1} aria-hidden
          sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className="absolute left-0 top-0 border-0 bg-white"
          style={{ width: SNAP_W, height: SNAP_H, transform: `scale(${width / SNAP_W})`, transformOrigin: "0 0", pointerEvents: "none" }}
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
        </div>
      )}
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white opacity-90 transition-opacity group-hover:opacity-100">
        <ExternalLink className="h-3 w-3" /> Buka laman
      </span>
    </a>
  );
}
