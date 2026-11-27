"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PajskRules, Stage } from "@/lib/pajsk/rules";

// Certificates → PAJSK (Beta): who sees PAJSK, and the year's rules (marks,
// colours, and the stage of each event found on issued certificates).

type AccessMode = "OFF" | "TESTERS" | "ALL";
type Access = { mode: AccessMode; testerEmails: string[]; updatedAt: string | null; updatedBy: string | null };
type EventRow = { eventId: string; eventName: string; total: number; levels: Record<string, number> };
type Data = {
  access: Access; season: { id: string; year: number; name: string } | null; rules: PajskRules | null;
  events: EventRow[]; issued: Record<string, number>; canWrite: boolean;
};

const API = "/api/v2/organizer/pajsk";
const STAGES: Stage[] = ["KEBANGSAAN", "NEGERI", "SEKOLAH"];
const LEVEL_LABEL: Record<string, string> = { NATIONAL: "Kebangsaan", STATE: "Negeri", SCHOOL: "Sekolah", NONE: "Tiada tahap" };

const MODES: { value: AccessMode; title: string; text: string }[] = [
  { value: "OFF", title: "Tutup", text: "Tiada pengurus atau peserta melihat PAJSK." },
  { value: "TESTERS", title: "Penguji sahaja", text: "Pengurus yang disenaraikan (portal pengurus) dan peserta kontinjen mereka." },
  { value: "ALL", title: "Semua", text: "Semua pengurus kontinjen dan semua peserta." },
];

export function PajskSettingsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<AccessMode>("OFF");
  const [emails, setEmails] = useState("");
  const [rules, setRules] = useState<PajskRules | null>(null);
  const [busy, setBusy] = useState<"access" | "rules" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(API, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? `HTTP ${r.status}` }); return; }
    setData(j); setMode(j.access.mode); setEmails(j.access.testerEmails.join("\n")); setRules(j.rules);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  async function save(kind: "access" | "rules") {
    setBusy(kind); setMsg(null);
    try {
      const body = kind === "access" ? { access: { mode, testerEmails: emails } } : { rules };
      const r = await fetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.issues?.[0] ? `${j.error}: ${j.issues[0].path?.join(".")} ${j.issues[0].message}` : j.error ?? `HTTP ${r.status}`);
      setMsg({ ok: true, text: kind === "access" ? "Akses disimpan." : "Peraturan disimpan." });
      await load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan" }); }
    finally { setBusy(null); }
  }

  if (!data) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>;
  const ro = !data.canWrite;
  const places = rules ? Array.from({ length: rules.placesShown }, (_, i) => String(i + 1)) : [];
  const setPlaceMark = (p: string, v: number) => rules && setRules({ ...rules, pencapaian: { ...rules.pencapaian, marksByPlace: { ...rules.pencapaian.marksByPlace, [p]: v } } });
  const setEventStage = (id: string, v: string) => {
    if (!rules) return;
    const next = { ...rules.eventStages };
    if (v) next[id] = v as Stage; else delete next[id];
    setRules({ ...rules, eventStages: next });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
          PAJSK <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-700">Beta</span>
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Markah PAJSK setiap peserta, setiap pertandingan, dikira daripada sijil penyertaan dan pencapaian yang telah dikeluarkan
          {data.season ? ` (${data.season.name})` : ""}. Sijil PAJSK diberi kod pengesahan 10 aksara yang boleh disemak di /sahkan-pajsk.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Sijil PAJSK dikeluarkan: <b className="tabular-nums">{(data.issued.VALID ?? 0).toLocaleString()}</b> sah
          {data.issued.WITHDRAWN ? <>, <b className="tabular-nums">{data.issued.WITHDRAWN.toLocaleString()}</b> ditarik balik</> : null}
          {" "}(dijana apabila peserta atau pengurus membuka halaman PAJSK).
        </p>
      </div>

      {msg && (
        <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}
        </div>
      )}

      {/* Access */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Akses</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {MODES.map(m => (
            <label key={m.value} className={cn("cursor-pointer rounded-lg border p-3 text-sm", mode === m.value ? "border-[#085782] bg-blue-50/60" : "hover:bg-zinc-50", ro && "cursor-not-allowed opacity-70")}>
              <input type="radio" name="mode" className="sr-only" checked={mode === m.value} disabled={ro} onChange={() => setMode(m.value)} />
              <span className="font-semibold text-zinc-900">{m.title}</span>
              <span className="mt-0.5 block text-xs text-zinc-500">{m.text}</span>
            </label>
          ))}
        </div>
        {mode === "TESTERS" && (
          <div className="mt-4">
            <label className="text-xs font-medium text-zinc-700" htmlFor="pajsk-testers">E-mel pengurus penguji (satu setiap baris)</label>
            <textarea
              id="pajsk-testers" rows={4} value={emails} disabled={ro} onChange={e => setEmails(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" placeholder="pengurus@sekolah.edu.my"
            />
            <p className="mt-1 text-xs text-zinc-500">E-mel akaun portal pengurus. Peserta dalam kontinjen yang mereka urus juga melihat PAJSK.</p>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {data.access.updatedAt ? `Dikemas kini ${new Date(data.access.updatedAt).toLocaleString()} oleh ${data.access.updatedBy}` : "Belum pernah ditetapkan"}
          </p>
          <button type="button" onClick={() => save("access")} disabled={ro || busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-[#085782] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy === "access" && <Loader2 className="h-4 w-4 animate-spin" />} Simpan akses
          </button>
        </div>
      </section>

      {/* Rules */}
      {!rules || !data.season ? (
        <section className="rounded-xl border bg-white p-5 text-sm text-zinc-500 shadow-sm">
          Tiada peraturan PAJSK bagi musim semasa. Tambah fail <code>src/lib/pajsk/rules/&lt;tahun&gt;.json</code>.
        </section>
      ) : (
        <section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Peraturan {rules.year}</h2>
            <p className="text-xs text-zinc-500">Disimpan sebagai data (pajsk_rules_{rules.year}). Tahun hadapan hanya perlukan peraturan baharu.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pelibatan (setiap penyertaan)</h3>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-zinc-700">{rules.pelibatan.label}, {rules.pelibatan.level} =</span>
                <input type="number" min={0} max={100} value={rules.pelibatan.marks} disabled={ro}
                  onChange={e => setRules({ ...rules, pelibatan: { ...rules.pelibatan, marks: Number(e.target.value) } })}
                  className="w-20 rounded border px-2 py-1 text-right tabular-nums" />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pencapaian ({rules.pencapaian.level}) mengikut tempat</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {places.map(p => (
                  <label key={p} className="flex items-center gap-1 text-sm">
                    <span className="text-zinc-500">{p}</span>
                    <input type="number" min={0} max={100} value={rules.pencapaian.marksByPlace[p] ?? 0} disabled={ro}
                      onChange={e => setPlaceMark(p, Number(e.target.value))}
                      className="w-14 rounded border px-1.5 py-1 text-right tabular-nums" />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-zinc-500">Dipaparkan hingga tempat ke-{rules.placesShown}; pingat untuk tempat {Object.keys(rules.medals).join(", ")}.</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Warna sijil mengikut peringkat tertinggi</h3>
            <div className="mt-2 flex flex-wrap gap-4">
              {STAGES.map(s => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="color" value={rules.stages[s].colour} disabled={ro}
                    onChange={e => setRules({ ...rules, stages: { ...rules.stages, [s]: { ...rules.stages[s], colour: e.target.value } } })}
                    className="h-7 w-9 cursor-pointer rounded border" />
                  {rules.stages[s].label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Peringkat setiap acara (daripada sijil yang dikeluarkan)</h3>
            <p className="mt-1 flex gap-1.5 text-xs text-zinc-500">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              Secara lalai, peringkat sijil ikut tahap edarannya (Kebangsaan → Kebangsaan, Negeri → Negeri / Zon, Sekolah → Sekolah).
              Tetapkan peringkat di sini untuk acara yang sijilnya belum diedarkan, atau untuk mengatasi tahap edaran. Sijil tanpa tahap edaran dan tanpa peringkat acara tidak dikira.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b"><th className="py-2 pr-3">Acara (pada sijil)</th><th className="py-2 pr-3 text-right">Sijil peserta</th><th className="py-2 pr-3">Tahap edaran</th><th className="py-2">Peringkat PAJSK</th></tr>
                </thead>
                <tbody>
                  {data.events.map(ev => (
                    <tr key={ev.eventId} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-zinc-800">{ev.eventName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{ev.total.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-xs text-zinc-500">
                        {Object.entries(ev.levels).map(([l, n]) => `${LEVEL_LABEL[l] ?? l} ${n.toLocaleString()}`).join(" · ")}
                      </td>
                      <td className="py-2">
                        <select value={rules.eventStages[ev.eventId] ?? ""} disabled={ro} onChange={e => setEventStage(ev.eventId, e.target.value)}
                          className="rounded border px-2 py-1 text-sm">
                          <option value="">Ikut tahap edaran</option>
                          {STAGES.map(s => <option key={s} value={s}>{rules.stages[s].label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!data.events.length && <tr><td colSpan={4} className="py-3 text-zinc-400">Tiada sijil peserta dikeluarkan lagi.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={() => save("rules")} disabled={ro || busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-[#085782] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === "rules" && <Loader2 className="h-4 w-4 animate-spin" />} Simpan peraturan
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
