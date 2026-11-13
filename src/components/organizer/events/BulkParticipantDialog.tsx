"use client";

import { useState } from "react";
import { AlertCircle, Check, CheckCircle2, ClipboardCopy, FileSpreadsheet, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Candidate = {
  name: string; passport: string; birthDate: string; gender: string; eduLevel: string;
  classGrade: string; email: string; phoneNumber: string; ppki: boolean;
};
type Row = { index: number; input: Candidate; error: string | null; message: string | null };

const EDU: Record<string, string> = { KINDERGARTEN: "Prasekolah", PRIMARY: "Rendah", SECONDARY: "Menengah", YOUTH: "Belia" };
const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls";

/**
 * A formatted sample, tab-separated so it pastes into Excel / Google Sheets as
 * columns (and back into the box as-is). Every column the import reads.
 */
const SAMPLE = [
  ["Nama", "Pasport", "Tarikh lahir", "Jantina", "Tahap", "Darjah", "E-mel", "Telefon", "PPKI"],
  ["Nguyen Van An", "C1234567", "12/03/2012", "Lelaki", "Rendah", "Darjah 6", "an.nguyen@example.com", "+84 912 345 678", "Tidak"],
  ["Tran Thi Binh", "C7654321", "25/08/2010", "Perempuan", "Menengah", "Tingkatan 2", "", "", "Tidak"],
].map(r => r.join("\t")).join("\n");

/**
 * Pendaftaran pukal: participants from a CSV / TSV / TXT / XLSX file or pasted
 * text. Columns are matched by their headers (Nama, Pasport, Tarikh lahir,
 * Jantina, Tahap, Darjah, E-mel, Telefon, PPKI — or the English names); when
 * they can't be, or "Guna pembantu AI" is ticked, Gemini reads the text. Every
 * row is previewed with its check before anything is saved.
 */
export function BulkParticipantDialog({ url, schoolName, headers, onClose, onDone }: {
  url: string; schoolName: string; onClose: () => void; onDone: () => void;
  /** Extra request headers (a registration link's passcode). */
  headers?: Record<string, string>;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: { name: string; message: string | null }[] } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copySample() {
    try { await navigator.clipboard.writeText(SAMPLE); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setText(SAMPLE); setFile(null); } // clipboard blocked: put it in the box instead
  }

  /** The first sheet (or the pasted / text file) as header-keyed rows, plus its text for the AI. */
  async function readInput(): Promise<{ rows: Record<string, unknown>[]; text: string }> {
    const XLSX = await import("xlsx");
    let wb;
    let raw = text;
    if (file && /\.(xlsx|xls)$/i.test(file.name)) {
      wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    } else {
      if (file) raw = await file.text();
      // raw: keep text as written — otherwise "12/03/2012" is read month-first (3 Dec). Dates are read day-first on the server.
      wb = XLSX.read(raw, { type: "string", raw: true });
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    // raw: dates stay Excel serial numbers (no time-zone shift); the server reads them.
    const sheetRows = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true }) : [];
    return { rows: sheetRows, text: file && /\.(xlsx|xls)$/i.test(file.name) && ws ? XLSX.utils.sheet_to_csv(ws) : raw };
  }

  async function preview() {
    setBusy("read"); setErr(""); setRows(null); setResult(null);
    try {
      const input = await readInput();
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "preview", ...input, useAi }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal membaca data");
      setRows(j.rows); setUsedAi(j.usedAi);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal membaca data"); }
    finally { setBusy(null); }
  }

  async function save() {
    if (!rows) return;
    setBusy("save"); setErr("");
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "import", participants: rows.filter(r => !r.error).map(r => r.input) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal mendaftar");
      setResult(j);
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal mendaftar"); }
    finally { setBusy(null); }
  }

  const valid = rows?.filter(r => !r.error).length ?? 0;
  const invalid = (rows?.length ?? 0) - valid;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Daftar peserta secara pukal · {schoolName}</DialogTitle>
          <DialogDescription>
            Muat naik CSV, TXT atau XLSX, atau tampal senarai. Lajur dikenal pasti melalui tajuknya — Nama, Pasport, Tarikh lahir, Jantina,
            Tahap, Darjah, E-mel, Telefon, PPKI (atau nama Inggerisnya). Tahap dan darjah yang kosong diisi daripada tarikh lahir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-4">
          {result ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> {result.created} peserta didaftarkan.
              </p>
              {result.skipped.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-semibold">{result.skipped.length} dilangkau:</p>
                  <ul className="mt-1 list-disc pl-4">{result.skipped.map((s, i) => <li key={i}>{s.name} — {s.message}</li>)}</ul>
                </div>
              )}
              <div className="flex justify-end"><Button onClick={onClose}>Selesai</Button></div>
            </div>
          ) : (
            <>
              {!rows && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  <span className="flex-1">
                    Format: <span className="font-mono text-[11px]">Nama · Pasport · Tarikh lahir (hh/bb/tttt) · Jantina · Tahap · Darjah · E-mel · Telefon · PPKI</span>
                    <span className="text-zinc-400"> — hanya Nama, Pasport, Tarikh lahir dan Jantina wajib.</span>
                  </span>
                  <Button size="sm" variant="outline" className="h-7 gap-1 bg-white text-xs" onClick={copySample}
                    title="Salin contoh berformat — tampal ke Excel / Google Sheets, isi, kemudian salin semula ke sini">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    {copied ? "Disalin" : "Salin contoh"}
                  </Button>
                </div>
              )}
              {!rows && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center",
                    file ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 hover:border-zinc-300")}>
                    <Upload className="h-6 w-6 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-700">{file ? file.name : "Pilih fail CSV / TXT / XLSX"}</span>
                    <span className="text-[11px] text-zinc-400">Helaian pertama dibaca; baris pertama sebagai tajuk lajur.</span>
                    <input type="file" accept={ACCEPT} className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); setText(""); }} />
                    {file && <button type="button" onClick={e => { e.preventDefault(); setFile(null); }} className="text-[11px] text-red-600 underline">Buang fail</button>}
                  </label>
                  <textarea value={text} onChange={e => { setText(e.target.value); setFile(null); }} rows={8}
                    placeholder={"…atau tampal di sini (dari Excel, CSV, atau senarai bebas)\n\nNama\tPasport\tTarikh lahir\tJantina\nNguyen Van A\tC1234567\t12/03/2012\tL"}
                    className="w-full rounded-xl border px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              )}

              {rows && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{valid} sah</span>
                    {invalid > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">{invalid} ralat — tidak akan didaftarkan</span>}
                    {usedAi && <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700"><Sparkles className="h-3 w-3" /> Dibaca oleh pembantu AI — semak sebelum mendaftar</span>}
                    <button onClick={() => setRows(null)} className="ml-auto text-zinc-500 underline">Tukar data</button>
                  </div>
                  <div className="max-h-[50vh] overflow-auto rounded-xl border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-50 text-left text-[11px] text-zinc-500">
                        <tr>{["", "Nama", "Pasport", "Tarikh lahir", "Jantina", "Tahap / darjah", "E-mel / telefon", "Status", ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map(r => (
                          <tr key={r.index} className={r.error ? "bg-red-50/40" : ""}>
                            <td className="px-2 py-1.5">{r.error ? <AlertCircle className="h-3.5 w-3.5 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}</td>
                            <td className="px-2 py-1.5 font-medium text-zinc-800">{r.input.name || "—"}</td>
                            <td className="px-2 py-1.5 font-mono">{r.input.passport || "—"}</td>
                            <td className="px-2 py-1.5">{r.input.birthDate || "—"}</td>
                            <td className="px-2 py-1.5">{r.input.gender === "MALE" ? "Lelaki" : r.input.gender === "FEMALE" ? "Perempuan" : "—"}</td>
                            <td className="px-2 py-1.5">{EDU[r.input.eduLevel] ?? "—"}{r.input.classGrade && ` · ${r.input.classGrade}`}{r.input.ppki && " · PPKI"}</td>
                            <td className="px-2 py-1.5 text-zinc-500">{[r.input.email, r.input.phoneNumber].filter(Boolean).join(" · ") || "—"}</td>
                            <td className={cn("px-2 py-1.5", r.error ? "text-red-600" : "text-emerald-700")}>{r.message ?? "Sedia"}</td>
                            <td className="px-2 py-1.5">
                              <button title="Buang baris" onClick={() => setRows(rs => rs?.filter(x => x.index !== r.index) ?? null)} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-3.5 w-3.5" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {err && <p className="flex items-start gap-1.5 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err}</p>}

              <div className="flex flex-wrap items-center justify-end gap-3">
                {!rows && (
                  <label className="mr-auto flex items-center gap-1.5 text-xs text-zinc-600" title="Gunakan Gemini untuk membaca senarai tanpa tajuk lajur yang dikenali">
                    <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} className="accent-violet-600" />
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Guna pembantu AI (untuk senarai bebas / tajuk tidak dikenali — digunakan secara automatik jika perlu)
                  </label>
                )}
                <Button variant="outline" onClick={onClose}>Batal</Button>
                {!rows ? (
                  <Button onClick={preview} disabled={busy !== null || (!file && !text.trim())} className="gap-1.5">
                    {busy === "read" && <Loader2 className="h-4 w-4 animate-spin" />} Semak data
                  </Button>
                ) : (
                  <Button onClick={save} disabled={busy !== null || valid === 0} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Daftar {valid} peserta
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
