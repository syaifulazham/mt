"use client";

import { useState, useCallback, useEffect } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

type EduLevel  = "PRIMARY" | "SECONDARY" | "YOUTH";
type Gender    = "MALE" | "FEMALE";
type Ethnicity = "MELAYU" | "CINA" | "INDIA" | "ORANG_ASLI_SEMENANJUNG" | "BUMIPUTRA_SABAH" | "BUMIPUTRA_SARAWAK" | "LAIN_LAIN";

type Participant = {
  id: string; name: string; ic: string | null;
  gender: Gender; eduLevel: EduLevel; classGrade: string | null;
};

const ETHNICITY_LABELS: Record<Ethnicity, string> = {
  MELAYU: "Melayu", CINA: "Cina", INDIA: "India",
  ORANG_ASLI_SEMENANJUNG: "Orang Asli",
  BUMIPUTRA_SABAH: "Bumiputra Sabah", BUMIPUTRA_SARAWAK: "Bumiputra Sarawak",
  LAIN_LAIN: "Lain-lain",
};

const GENDER_LABELS: Record<Gender, string> = { MALE: "Lelaki", FEMALE: "Perempuan" };

type SaveState = "idle" | "saving" | "ok" | "err";

function EthnicityRow({ p, onSaved }: { p: Participant; onSaved: (id: string) => void }) {
  const t = useTranslations("dashboard.missingEthnicity");
  const [ethnicity, setEthnicity] = useState<Ethnicity | "">("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [noChoice,  setNoChoice]  = useState(false);

  const sel = "h-7 rounded border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 w-full";

  async function handleSave() {
    if (!ethnicity) { setNoChoice(true); setTimeout(() => setNoChoice(false), 2500); return; }
    setNoChoice(false);
    setSaveState("saving");
    try {
      const res = await fetch(`/api/v2/manager/participants/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       p.name,
          ic:         p.ic        ?? null,
          gender:     p.gender,
          eduLevel:   p.eduLevel,
          classGrade: p.classGrade ?? null,
          ethnicity,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveState("ok");
      setTimeout(() => onSaved(p.id), 700);
    } catch {
      setSaveState("err");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
      <td className="px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 whitespace-nowrap max-w-[160px] truncate" title={p.name}>
        {p.name}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
        {p.classGrade ?? "—"}
      </td>
      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
        {GENDER_LABELS[p.gender]}
      </td>
      <td className="px-3 py-2">
        <select
          className={`${sel} ${noChoice ? "border-red-400 ring-1 ring-red-300" : ""}`}
          value={ethnicity}
          onChange={e => { setEthnicity(e.target.value as Ethnicity | ""); setNoChoice(false); }}
        >
          <option value="">{t("placeholder")}</option>
          {(Object.entries(ETHNICITY_LABELS) as [Ethnicity, string][]).map(([k, lbl]) => (
            <option key={k} value={k}>{lbl}</option>
          ))}
        </select>
        {noChoice && <p className="text-[10px] text-red-500 mt-0.5">{t("selectPrompt")}</p>}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {saveState === "saving" ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400 inline" />
        ) : saveState === "ok" ? (
          <Check className="h-4 w-4 text-emerald-500 inline" />
        ) : saveState === "err" ? (
          <X className="h-4 w-4 text-red-500 inline" />
        ) : (
          <Button size="sm" onClick={handleSave}
            className="h-6 px-2.5 text-[11px] bg-orange-500 hover:bg-orange-600 text-white">
            {t("save")}
          </Button>
        )}
      </td>
    </tr>
  );
}

export function MissingEthnicityAlert() {
  const t = useTranslations("dashboard.missingEthnicity");
  const [rows,     setRows]     = useState<Participant[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/v2/manager/participants/missing-ethnicity")
      .then(r => r.json())
      .then(j => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = useCallback((id: string) => {
    setRows(prev => prev.filter(p => p.id !== id));
  }, []);

  if (loading || rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-700 overflow-hidden">

      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-100/60 dark:hover:bg-orange-900/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
            {t("title", { count: rows.length })}
          </p>
          <p className="text-[11px] text-orange-600 dark:text-orange-500 mt-0.5">
            {t("subtitle")}
          </p>
        </div>
        {expanded
          ? <ChevronUp   className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-orange-200 dark:border-orange-700 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-orange-100/70 dark:bg-orange-900/30">
                <th className="px-3 py-2 text-left font-semibold text-orange-800 dark:text-orange-300 whitespace-nowrap">{t("colName")}</th>
                <th className="px-3 py-2 text-left font-semibold text-orange-800 dark:text-orange-300 whitespace-nowrap">{t("colGrade")}</th>
                <th className="px-3 py-2 text-left font-semibold text-orange-800 dark:text-orange-300 whitespace-nowrap">{t("colGender")}</th>
                <th className="px-3 py-2 text-left font-semibold text-orange-800 dark:text-orange-300 whitespace-nowrap">{t("colRace")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <EthnicityRow key={p.id} p={p} onSaved={handleSaved} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
