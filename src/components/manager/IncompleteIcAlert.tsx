"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Check, X, Sparkles, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

type EduLevel  = "PRIMARY" | "SECONDARY" | "YOUTH";
type Gender    = "MALE" | "FEMALE";
type Ethnicity = "MELAYU" | "CINA" | "INDIA" | "ORANG_ASLI_SEMENANJUNG" | "BUMIPUTRA_SABAH" | "BUMIPUTRA_SARAWAK" | "LAIN_LAIN";

type Participant = {
  id: string; name: string; ic: string | null;
  gender: Gender; eduLevel: EduLevel; classGrade: string | null; ethnicity: Ethnicity | null;
};

const GRADE_OPTIONS: Record<EduLevel, string[]> = {
  PRIMARY:   ["Darjah 1","Darjah 2","Darjah 3","Darjah 4","Darjah 5","Darjah 6"],
  SECONDARY: ["Tingkatan 1","Tingkatan 2","Tingkatan 3","Tingkatan 4","Tingkatan 5"],
  YOUTH:     [],
};

const GENDER_LABELS: Record<Gender, string> = { MALE: "Lelaki", FEMALE: "Perempuan" };
const ETHNICITY_LABELS: Record<Ethnicity, string> = {
  MELAYU: "Melayu", CINA: "Cina", INDIA: "India",
  ORANG_ASLI_SEMENANJUNG: "Orang Asli",
  BUMIPUTRA_SABAH: "Bumiputra Sabah", BUMIPUTRA_SARAWAK: "Bumiputra Sarawak",
  LAIN_LAIN: "Lain-lain",
};

// ── Malaysian IC parser ────────────────────────────────────────────────────────
// Derives gender and classGrade from a 12-digit Malaysian IC (YYMMDDPB####).

function parseIcDerived(ic: string): { gender: Gender; classGrade: string } | null {
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) return null;

  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const currentYear = new Date().getFullYear();
  const birthYear   = yy <= currentYear % 100 ? 2000 + yy : 1900 + yy;
  const age         = currentYear - birthYear;

  const gender: Gender = parseInt(digits[11], 10) % 2 === 1 ? "MALE" : "FEMALE";

  let classGrade = "";
  if (age >= 7  && age <= 12) classGrade = `Darjah ${Math.min(Math.max(age - 6,  1), 6)}`;
  else if (age >= 13 && age <= 17) classGrade = `Tingkatan ${Math.min(Math.max(age - 12, 1), 5)}`;

  return { gender, classGrade };
}

type RowEdit  = { ic: string; gender: Gender; classGrade: string; ethnicity: Ethnicity | "" };
type SaveState = "idle" | "saving" | "ok" | "err";

// ── Individual row ─────────────────────────────────────────────────────────────

function ParticipantRow({
  p,
  suggestedIc,
  onSaved,
}: {
  p: Participant;
  suggestedIc?: string;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("dashboard.incompleteIc");
  const [edit, setEdit] = useState<RowEdit>({
    ic:         p.ic         ?? "",
    gender:     p.gender,
    classGrade: p.classGrade ?? "",
    ethnicity:  p.ethnicity  ?? "",
  });
  const [saveState,  setSaveState]  = useState<SaveState>("idle");
  // Track which fields were auto-filled from IC (for highlighting)
  const [icFilled, setIcFilled] = useState<{ gender: boolean; classGrade: boolean }>({ gender: false, classGrade: false });

  // Apply IC + derived values at once (used by suggestion and manual IC entry)
  const applyIc = useCallback((ic: string) => {
    const derived = parseIcDerived(ic);
    setEdit(v => ({
      ...v,
      ic,
      ...(derived ? { gender: derived.gender, classGrade: derived.classGrade || v.classGrade } : {}),
    }));
    setIcFilled({
      gender:     !!derived,
      classGrade: !!(derived?.classGrade),
    });
  }, []);

  // Pre-fill from AI suggestion
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (suggestedIc) applyIc(suggestedIc); }, [suggestedIc, applyIc]);

  const gradeOpts = GRADE_OPTIONS[p.eduLevel] ?? [];
  const dirty =
    edit.ic         !== (p.ic         ?? "") ||
    edit.gender     !== p.gender             ||
    edit.classGrade !== (p.classGrade ?? "") ||
    edit.ethnicity  !== (p.ethnicity  ?? "");

  const isAiSuggested = suggestedIc !== undefined && edit.ic === suggestedIc && suggestedIc !== (p.ic ?? "");

  async function handleSave() {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/v2/manager/participants/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       p.name,
          ic:         edit.ic        || null,
          gender:     edit.gender,
          eduLevel:   p.eduLevel,
          classGrade: edit.classGrade || null,
          ethnicity:  edit.ethnicity  || null,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveState("ok");
      setTimeout(() => {
        if (edit.ic && !edit.ic.endsWith("00000")) onSaved(p.id);
        else setSaveState("idle");
      }, 900);
    } catch {
      setSaveState("err");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }

  const sel = "h-7 rounded border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 w-full";

  // Row tint: sky if AI-suggested, teal if IC-derived, plain otherwise
  const rowBg = isAiSuggested
    ? "bg-sky-50 dark:bg-sky-900/20"
    : (icFilled.gender || icFilled.classGrade)
      ? "bg-teal-50 dark:bg-teal-900/20"
      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30";

  function cellHl(active: boolean) {
    return active ? "bg-sky-100 dark:bg-sky-800/30" : "";
  }

  return (
    <tr className={`border-b border-zinc-100 dark:border-zinc-800 transition-colors ${rowBg}`}>

      {/* Name */}
      <td className="px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 whitespace-nowrap max-w-[160px] truncate" title={p.name}>
        {p.name}
      </td>

      {/* IC */}
      <td className={`px-3 py-2 ${cellHl(isAiSuggested)}`}>
        <div className="relative">
          <Input
            value={edit.ic}
            onChange={e => {
              const val = e.target.value;
              const derived = parseIcDerived(val);
              if (derived) {
                applyIc(val);
              } else {
                setEdit(v => ({ ...v, ic: val }));
                setIcFilled({ gender: false, classGrade: false });
              }
            }}
            className={`h-7 text-xs w-36 font-mono ${isAiSuggested ? "border-sky-400 ring-1 ring-sky-300" : ""}`}
            placeholder="No. IC"
            maxLength={20}
          />
          {isAiSuggested && (
            <span className="absolute -top-1.5 -right-1 text-[9px] bg-sky-500 text-white rounded px-1 leading-tight">AI</span>
          )}
        </div>
      </td>

      {/* Grade */}
      <td className={`px-3 py-2 ${cellHl(icFilled.classGrade)}`}>
        {gradeOpts.length > 0 ? (
          <select
            className={`${sel} ${icFilled.classGrade ? "border-teal-400" : ""}`}
            value={edit.classGrade}
            onChange={e => {
              setEdit(v => ({ ...v, classGrade: e.target.value }));
              setIcFilled(v => ({ ...v, classGrade: false }));
            }}
          >
            <option value="">—</option>
            {gradeOpts.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        ) : (
          <Input
            value={edit.classGrade}
            onChange={e => {
              setEdit(v => ({ ...v, classGrade: e.target.value }));
              setIcFilled(v => ({ ...v, classGrade: false }));
            }}
            className="h-7 text-xs w-28"
            placeholder="—"
          />
        )}
      </td>

      {/* Gender */}
      <td className={`px-3 py-2 ${cellHl(icFilled.gender)}`}>
        <select
          className={`${sel} ${icFilled.gender ? "border-teal-400" : ""}`}
          value={edit.gender}
          onChange={e => {
            setEdit(v => ({ ...v, gender: e.target.value as Gender }));
            setIcFilled(v => ({ ...v, gender: false }));
          }}
        >
          {(Object.entries(GENDER_LABELS) as [Gender, string][]).map(([k, lbl]) => (
            <option key={k} value={k}>{lbl}</option>
          ))}
        </select>
      </td>

      {/* Race */}
      <td className="px-3 py-2">
        <select className={sel} value={edit.ethnicity} onChange={e => setEdit(v => ({ ...v, ethnicity: e.target.value as Ethnicity | "" }))}>
          <option value="">—</option>
          {(Object.entries(ETHNICITY_LABELS) as [Ethnicity, string][]).map(([k, lbl]) => (
            <option key={k} value={k}>{lbl}</option>
          ))}
        </select>
      </td>

      {/* Save */}
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {saveState === "saving" ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400 inline" />
        ) : saveState === "ok" ? (
          <Check className="h-4 w-4 text-emerald-500 inline" />
        ) : saveState === "err" ? (
          <X className="h-4 w-4 text-red-500 inline" />
        ) : (
          <Button size="sm" disabled={!dirty} onClick={handleSave}
            className="h-6 px-2.5 text-[11px] bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-30">
            {t("save")}
          </Button>
        )}
      </td>
    </tr>
  );
}

// ── AI Repair Panel ────────────────────────────────────────────────────────────

function AiRepairPanel({
  participants,
  onSuggestions,
}: {
  participants: Participant[];
  onSuggestions: (map: Record<string, string>) => void;
}) {
  const t = useTranslations("dashboard.incompleteIc");
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [count,   setCount]   = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText(ev.target?.result as string ?? "");
    reader.readAsText(file, "utf-8");
  }

  async function handleExtract() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setCount(null);
    try {
      const res = await fetch("/api/v2/manager/participants/incomplete-ic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          participants: participants.map(p => ({ id: p.id, name: p.name })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("extractError"));
      const suggestions: { participantId: string; ic: string }[] = json.suggestions ?? [];
      const map: Record<string, string> = {};
      for (const s of suggestions) map[s.participantId] = s.ic;
      setCount(suggestions.length);
      onSuggestions(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("extractError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-amber-200 dark:border-amber-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t("aiPanelTitle")}</span>
        <span className="text-[11px] text-zinc-400">{t("aiPanelHint")}</span>
      </div>

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3 w-3" /> {t("uploadBtn")}
        </Button>
        {text && (
          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {t("chars", { count: text.length.toLocaleString() })}
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t("textPlaceholder")}
        rows={4}
        className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs px-3 py-2 font-mono resize-y focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder:text-zinc-400"
      />

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!text.trim() || loading}
          onClick={handleExtract}
          className="h-7 px-3 text-[11px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
        >
          {loading
            ? <><Loader2 className="h-3 w-3 animate-spin" /> {t("extracting")}</>
            : <><Sparkles className="h-3 w-3" /> {t("extractBtn")}</>
          }
        </Button>
        {count !== null && (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            {count > 0 ? t("matchesFound", { count }) : t("noMatches")}
          </span>
        )}
        {error && <span className="text-[11px] text-red-500">{error}</span>}
      </div>

      {count !== null && count > 0 && (
        <p className="text-[11px] text-sky-600 dark:text-sky-400">
          {t("aiHint")}
        </p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function IncompleteIcAlert() {
  const t = useTranslations("dashboard.incompleteIc");
  const [rows,        setRows]        = useState<Participant[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState(false);
  const [aiOpen,      setAiOpen]      = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/v2/manager/participants/incomplete-ic")
      .then(r => r.json())
      .then(j => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = useCallback((id: string) => {
    setRows(prev => prev.filter(p => p.id !== id));
    setSuggestions(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  if (loading) return null;
  if (rows.length === 0) return null;

  const suggestedCount = Object.keys(suggestions).length;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 overflow-hidden">

      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {t("title", { count: rows.length })}
            {suggestedCount > 0 && (
              <span className="ml-2 text-[11px] font-normal bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-1.5 py-0.5 rounded">
                {t("aiSuggestions", { count: suggestedCount })}
              </span>
            )}
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
            {t("subtitle")}
          </p>
        </div>
        {expanded
          ? <ChevronUp  className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        }
      </button>

      {expanded && (
        <>
          <div className="border-t border-amber-200 dark:border-amber-700 px-4 py-2 flex items-center justify-between bg-amber-50/50 dark:bg-amber-950/10">
            <span className="text-[11px] text-zinc-500">
              {t("hint")} {" "}
              <span className="text-sky-600 font-medium">{t("hintBlue")}</span>{" "}{t("hintBlueSuffix")}{" "}
              <span className="text-teal-600 font-medium">{t("hintTeal")}</span>{" "}{t("hintTealSuffix")}
            </span>
            <button
              type="button"
              onClick={() => setAiOpen(v => !v)}
              className="ml-4 flex items-center gap-1.5 text-[11px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 shrink-0"
            >
              <Sparkles className="h-3 w-3" />
              {aiOpen ? t("aiRepairOpen") : t("aiRepairClosed")}
            </button>
          </div>

          {aiOpen && (
            <AiRepairPanel participants={rows} onSuggestions={setSuggestions} />
          )}

          <div className="border-t border-amber-200 dark:border-amber-700 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-amber-100/70 dark:bg-amber-900/30">
                  <th className="px-3 py-2 text-left font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">{t("colName")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">{t("colIc")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">{t("colGrade")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">{t("colGender")}</th>
                  <th className="px-3 py-2 text-left font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">{t("colRace")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <ParticipantRow
                    key={p.id}
                    p={p}
                    suggestedIc={suggestions[p.id]}
                    onSaved={handleSaved}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
