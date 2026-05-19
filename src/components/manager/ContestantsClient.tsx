"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Search, Upload, Download, Plus, Eye, EyeOff, Pencil, Trash2,
  Loader2, CheckCircle2, AlertCircle, X, Sparkles,
  MoreHorizontal, Users, BookOpen, GraduationCap, Zap, Accessibility,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

type Contingent = { id: string; name: string };
type EduLevel   = "PRIMARY" | "SECONDARY" | "YOUTH";
type Gender     = "MALE" | "FEMALE";

type Contestant = {
  id: string; name: string; ic: string | null; email: string | null;
  phoneNumber: string | null; gender: Gender; age: number | null;
  eduLevel: EduLevel; classGrade: string | null; className: string | null;
  status: string; ppki: boolean;
};

const EDU_TABS: { key: EduLevel | "ALL"; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "ALL",       Icon: Users         },
  { key: "PRIMARY",   Icon: BookOpen      },
  { key: "SECONDARY", Icon: GraduationCap },
  { key: "YOUTH",     Icon: Zap           },
];

const GENDER_COLOR: Record<Gender, string> = {
  MALE:   "bg-blue-50 text-blue-700",
  FEMALE: "bg-pink-50 text-pink-700",
};

function GenderIcon({ gender }: { gender: Gender }) {
  return gender === "MALE" ? (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-bold select-none" title="Lelaki">♂</span>
  ) : (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-pink-100 text-pink-500 text-sm font-bold select-none" title="Perempuan">♀</span>
  );
}

const CLASS_LABEL = (c: Contestant) =>
  [c.classGrade, c.className].filter(Boolean).join(" – ") || "–";

// ── CSV template ──────────────────────────────────────────────────────────────
const CSV_TEMPLATE = `name,ic,gender,age,edu_level,class_grade,class_name,email,phoneNumber
Ahmad Bin Ali,010101012345,MALE,13,sekolah menengah,Tingkatan 1,Amanah,ahmad@example.com,0123456789
Siti Binti Bakar,020202023456,FEMALE,9,sekolah rendah,Darjah 3,Cerdas,,
`;

// ─────────────────────────────────────────────────────────────────────────────
// View modal
// ─────────────────────────────────────────────────────────────────────────────

function maskIc(ic: string) {
  if (ic.length <= 4) return ic;
  return ic.slice(0, 2) + "•".repeat(ic.length - 4) + ic.slice(-2);
}

function ViewDialog({ contestant, onClose }: { contestant: Contestant | null; onClose: () => void }) {
  const t = useTranslations("contestants");
  const [icRevealed, setIcRevealed] = useState(false);

  // Reset mask whenever a different contestant is opened
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIcRevealed(false); }, [contestant?.id]);

  if (!contestant) return null;
  const c = contestant;

  const avatar = c.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const rows: [string, string | null | undefined][] = [
    [t("view.age"),       c.age != null ? t("view.ageValue", { age: c.age }) : null],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [t("view.education"), t(`edu.${c.eduLevel}` as any)],
    [t("view.class"),     CLASS_LABEL(c) !== "–" ? CLASS_LABEL(c) : null],
    [t("view.email"),     c.email],
    [t("view.phone"),     c.phoneNumber],
  ];

  return (
    <Dialog open={!!contestant} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{t("view.title")}</DialogTitle>
        </DialogHeader>

        {/* Avatar + name hero */}
        <div className="flex flex-col items-center gap-2 py-5 mx-6 border-b">
          <div
            className={`h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold text-white
              ${c.gender === "MALE" ? "bg-blue-500" : "bg-pink-500"}`}
          >
            {avatar}
          </div>
          <p className="font-semibold text-base text-center leading-snug">{c.name}</p>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${GENDER_COLOR[c.gender]}`}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {t(`gender.${c.gender}` as any)}
          </span>
        </div>

        {/* Detail grid */}
        <div className="px-6 py-4 space-y-0">
          {/* IC row — masked by default */}
          <div className="grid grid-cols-[120px_1fr] gap-2 py-2.5 border-b">
            <span className="text-xs text-zinc-400 self-center">{t("view.ic")}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium font-mono tracking-wider">
                {c.ic
                  ? (icRevealed ? c.ic : maskIc(c.ic))
                  : <span className="text-zinc-300 font-normal font-sans">—</span>}
              </span>
              {c.ic && (
                <button
                  onClick={() => setIcRevealed((v) => !v)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                  title={icRevealed ? t("view.hideIc") : t("view.showIc")}
                >
                  {icRevealed
                    ? <EyeOff className="h-3.5 w-3.5" />
                    : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>

          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[120px_1fr] gap-2 py-2.5 border-b last:border-0">
              <span className="text-xs text-zinc-400 self-center">{label}</span>
              <span className="text-sm font-medium break-all">
                {value ?? <span className="text-zinc-300 font-normal">—</span>}
              </span>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5">
          <Button variant="outline" className="w-full" onClick={onClose}>{t("view.closeBtn")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit form
// ─────────────────────────────────────────────────────────────────────────────

const GRADE_OPTIONS: Record<EduLevel, string[]> = {
  PRIMARY:   ["Darjah 1","Darjah 2","Darjah 3","Darjah 4","Darjah 5","Darjah 6"],
  SECONDARY: ["Tingkatan 1","Tingkatan 2","Tingkatan 3","Tingkatan 4","Tingkatan 5"],
  YOUTH:     [],
};

function AddEditDialog({
  open, onClose, contingents, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contingents: Contingent[];
  initial?: Contestant | null;
  onSaved: () => void;
}) {
  const t = useTranslations("contestants");
  const isEdit = !!initial?.id;

  const defaultForm = {
    contingentId: contingents[0]?.id ?? "",
    name: "", ic: "", gender: "MALE" as Gender, age: "",
    eduLevel: "SECONDARY" as EduLevel,
    classGrade: "", className: "", email: "", phoneNumber: "",
    status: "ACTIVE", ppki: false,
  };

  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // Sync form when dialog opens with a new contestant
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setError("");
      if (initial) {
        setForm({
          contingentId: contingents[0]?.id ?? "",
          name:        initial.name        ?? "",
          ic:          initial.ic          ?? "",
          gender:      initial.gender      ?? "MALE",
          age:         initial.age != null ? String(initial.age) : "",
          eduLevel:    initial.eduLevel    ?? "SECONDARY",
          classGrade:  initial.classGrade  ?? "",
          className:   initial.className   ?? "",
          email:       initial.email       ?? "",
          phoneNumber: initial.phoneNumber ?? "",
          status:      initial.status      ?? "ACTIVE",
          ppki:        initial.ppki        ?? false,
        });
      } else {
        setForm(defaultForm);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function set(k: string, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) { setError(t("form.nameRequired")); return; }
    setSaving(true); setError("");
    try {
      const url    = isEdit ? `/api/v2/manager/contestants/${initial!.id}` : "/api/v2/manager/contestants";
      const method = isEdit ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: form.age ? Number(form.age) : null }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Failed"); }
      onSaved(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const gradeOptions = GRADE_OPTIONS[form.eduLevel] ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{isEdit ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            {isEdit ? t("form.editDesc") : t("form.addDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* PPKI toggle */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <span className="text-sm font-medium">{t("form.ppkiLabel")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={form.ppki}
                onClick={() => set("ppki", !form.ppki)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors focus-visible:outline-none
                  ${form.ppki ? "bg-[#085782]" : "bg-zinc-200"}`}
              >
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform
                  ${form.ppki ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span className="text-xs text-zinc-400 w-6">{form.ppki ? t("form.yes") : t("form.no")}</span>
            </div>
          </div>

          {contingents.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.contingentLabel")}</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.contingentId} onChange={(e) => set("contingentId", e.target.value)}>
                {contingents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">{t("form.nameLabel")}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ahmad Bin Ali" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("form.icLabel")}</Label>
            <Input value={form.ic} onChange={(e) => set("ic", e.target.value)} placeholder="010101012345" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.emailLabel")}</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.phoneLabel")}</Label>
              <Input value={form.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} placeholder="0123456789" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.genderLabel")}</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="MALE">{t("form.genderMale")}</option>
                <option value="FEMALE">{t("form.genderFemale")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.ageLabel")}</Label>
              <Input type="number" min="1" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="13" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("form.eduLabel")}</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.eduLevel}
              onChange={(e) => { set("eduLevel", e.target.value); set("classGrade", ""); }}>
              <option value="PRIMARY">{t("form.eduPrimary")}</option>
              <option value="SECONDARY">{t("form.eduSecondary")}</option>
              <option value="YOUTH">{t("form.eduYouth")}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.classNameLabel")}</Label>
              <Input value={form.className} onChange={(e) => set("className", e.target.value)} placeholder="Amanah" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.classGradeLabel")}</Label>
              {gradeOptions.length > 0 ? (
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.classGrade} onChange={(e) => set("classGrade", e.target.value)}>
                  <option value="">{t("form.selectGrade")}</option>
                  {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              ) : (
                <Input value={form.classGrade} onChange={(e) => set("classGrade", e.target.value)} placeholder="—" />
              )}
            </div>
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-sm">{t("form.statusLabel")}</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="ACTIVE">{t("form.statusActive")}</option>
                <option value="INACTIVE">{t("form.statusInactive")}</option>
              </select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2">
          <Button className="w-full bg-zinc-900 hover:bg-zinc-800 text-white gap-2" onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("form.saving")}</>
              : isEdit ? t("form.saveBtn") : t("form.addSaveBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side CSV parser
// ─────────────────────────────────────────────────────────────────────────────

const EDU_MAP: Record<string, EduLevel> = {
  primary: "PRIMARY", rendah: "PRIMARY", "sekolah rendah": "PRIMARY",
  darjah: "PRIMARY", std: "PRIMARY",
  secondary: "SECONDARY", menengah: "SECONDARY", "sekolah menengah": "SECONDARY",
  tingkatan: "SECONDARY", form: "SECONDARY",
  youth: "YOUTH", belia: "YOUTH", open: "YOUTH", tertiary: "YOUTH",
};

type RawRow = {
  name: string; ic: string; gender: string; age: string;
  edu_level: string; class_grade: string; class_name: string;
  email: string; phoneNumber: string;
  _issues: string[];  // field names with problems
};

type CleanRow = {
  name: string; ic: string | null; gender: Gender; age: number | null;
  eduLevel: EduLevel; classGrade: string | null; className: string | null;
  email: string | null; phoneNumber: string | null; contingentId: string;
};

function parseCsv(text: string): RawRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const get  = (key: string) => vals[headers.indexOf(key)] ?? "";
    const name       = get("name");
    const ic         = get("ic");
    const gender     = get("gender");
    const age        = get("age");
    const edu_level  = get("edu_level");
    const class_grade = get("class_grade");
    const class_name  = get("class_name");
    const email      = get("email");
    const phoneNumber = get("phonenumber") || get("phone_number") || get("phone");
    const issues: string[] = [];
    if (!name) issues.push("name");
    const gNorm = gender.toUpperCase();
    if (gNorm !== "MALE" && gNorm !== "FEMALE") issues.push("gender");
    const ednorm = edu_level.toLowerCase().trim();
    if (!EDU_MAP[ednorm] && !["primary","secondary","youth"].includes(ednorm)) issues.push("edu_level");
    return { name, ic, gender, age, edu_level, class_grade, class_name, email, phoneNumber, _issues: issues };
  });
}

function rawToClean(rows: RawRow[], contingentId: string): CleanRow[] {
  return rows.map((r) => {
    const gNorm = r.gender.toUpperCase();
    const gender: Gender = (gNorm === "FEMALE") ? "FEMALE" : "MALE";
    const ednorm = r.edu_level.toLowerCase().trim();
    const eduLevel: EduLevel = EDU_MAP[ednorm] ?? "SECONDARY";
    return {
      name:        r.name || "(no name)",
      ic:          r.ic  || null,
      gender,
      age:         r.age ? Number(r.age) : null,
      eduLevel,
      classGrade:  r.class_grade  || null,
      className:   r.class_name   || null,
      email:       r.email        || null,
      phoneNumber: r.phoneNumber  || null,
      contingentId,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview table (must be top-level to satisfy react-hooks/static-components)
// ─────────────────────────────────────────────────────────────────────────────

function PreviewTable({ rows }: { rows: CleanRow[]; isAi?: boolean }) {
  const t = useTranslations("contestants");
  const headers = [
    t("bulk.colName"), t("bulk.colIc"), t("bulk.colGender"),
    t("bulk.colAge"), t("bulk.colLevel"), t("bulk.colGrade"),
    t("bulk.colClass"), t("bulk.colEmail"),
  ];
  return (
    <div className="overflow-x-auto rounded-lg border text-xs">
      <table className="w-full">
        <thead className="bg-zinc-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium text-zinc-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t hover:bg-zinc-50">
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2 text-zinc-400">{row.ic ?? "–"}</td>
              <td className="px-3 py-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${GENDER_COLOR[row.gender]}`}>
                  {row.gender}
                </span>
              </td>
              <td className="px-3 py-2">{row.age ?? "–"}</td>
              <td className="px-3 py-2">{row.eduLevel}</td>
              <td className="px-3 py-2">{row.classGrade ?? "–"}</td>
              <td className="px-3 py-2">{row.className ?? "–"}</td>
              <td className="px-3 py-2 text-zinc-400">{row.email ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk upload dialog
// ─────────────────────────────────────────────────────────────────────────────

type BulkStep = "upload" | "raw" | "ai" | "done";

function BulkUploadDialog({
  open, onClose, contingents, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contingents: Contingent[];
  onSaved: () => void;
}) {
  const t = useTranslations("contestants");
  const [step, setStep]             = useState<BulkStep>("upload");
  const [contingentId, setId]       = useState(contingents[0]?.id ?? "");
  const [csvText, setCsvText]       = useState("");
  const [fileName, setFileName]     = useState("");
  const [rawRows, setRawRows]       = useState<RawRow[]>([]);
  const [cleanRows, setCleanRows]   = useState<CleanRow[]>([]);
  const [aiErrors, setAiErrors]     = useState<string[]>([]);
  const [cleaning, setCleaning]     = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [error, setError]           = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload"); setCsvText(""); setFileName("");
    setRawRows([]); setCleanRows([]); setAiErrors([]); setError("");
  }

  // ── Step 1: read file → parse client-side → go to raw preview ────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const parsed = parseCsv(text);
      setRawRows(parsed);
      setCleanRows(rawToClean(parsed, contingentId));
      setStep("raw");
    };
    reader.readAsText(file);
  }

  // ── Step 2a: send to Gemini for AI cleaning ───────────────────────────────
  async function handleAiClean() {
    setCleaning(true); setError(""); setAiErrors([]);
    try {
      const res = await fetch("/api/v2/manager/contestants/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, contingentId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "AI parse failed");  // server error key
      setCleanRows(j.data);
      setAiErrors(j.errors ?? []);
      setStep("ai");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
  }

  // ── Step 2b / 3: confirm import ───────────────────────────────────────────
  async function handleConfirm(rows: CleanRow[]) {
    setConfirming(true); setError("");
    try {
      const res = await fetch("/api/v2/manager/contestants/bulk-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, contingentId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Import failed"); }  // server error key
      const j = await res.json();
      setImportCount(j.count);
      setStep("done");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  const issueCount = rawRows.filter((r) => r._issues.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            {t("bulk.title")}
          </DialogTitle>
          <DialogDescription>{t("bulk.desc")}</DialogDescription>
        </DialogHeader>

        {/* ── step indicator ──────────────────────────── */}
        <div className="flex items-center gap-2 text-xs text-zinc-400 px-1">
          {(["upload","raw","ai","done"] as BulkStep[]).map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span>›</span>}
              <span className={step === s ? "text-[#085782] font-semibold" : ""}>
                {s === "upload" ? t("bulk.stepUpload") : s === "raw" ? t("bulk.stepPreview") : s === "ai" ? t("bulk.stepAiClean") : t("bulk.stepDone")}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">

          {/* ── Step: upload ────────────────────────────── */}
          {step === "upload" && (
            <>
              {contingents.length > 1 && (
                <div className="space-y-1">
                  <Label>{t("bulk.contingentLabel")}</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={contingentId} onChange={(e) => setId(e.target.value)}>
                    {contingents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div
                className="border-2 border-dashed border-zinc-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#085782]/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-zinc-300 mb-3" />
                <p className="text-sm font-medium text-zinc-600">{t("bulk.clickToChoose")}</p>
                <p className="text-xs text-zinc-400 mt-1">{t("bulk.noServerCall")}</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </div>
              <Button variant="outline" size="sm" className="gap-2"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = "data:text/csv," + encodeURIComponent(CSV_TEMPLATE);
                  a.download = "contestants-template.csv"; a.click();
                }}>
                <Download className="h-4 w-4" /> {t("bulk.downloadTemplate")}
              </Button>
            </>
          )}

          {/* ── Step: raw preview ───────────────────────── */}
          {step === "raw" && (
            <>
              <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                issueCount > 0 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
              }`}>
                {issueCount > 0
                  ? <AlertCircle className="h-4 w-4 shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span>
                  {t("bulk.rowsLoaded", { count: rawRows.length, file: fileName })}
                  {issueCount > 0
                    ? ` ${issueCount !== 1 ? t("bulk.issuesFoundPlural", { count: issueCount }) : t("bulk.issuesFound", { count: issueCount })}`
                    : ` ${t("bulk.allClean")}`}
                </span>
              </div>
              <PreviewTable rows={cleanRows} />
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
                </div>
              )}
            </>
          )}

          {/* ── Step: AI-cleaned preview ─────────────────── */}
          {step === "ai" && (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-700">
                <Sparkles className="h-4 w-4 shrink-0" />
                {cleanRows.length !== 1 ? t("bulk.aiCleanedPlural", { count: cleanRows.length }) : t("bulk.aiCleaned", { count: cleanRows.length })}
              </div>
              {aiErrors.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700">{t("bulk.excludedTitle")}</p>
                  {aiErrors.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
                </div>
              )}
              <PreviewTable rows={cleanRows} isAi />
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
                </div>
              )}
            </>
          )}

          {/* ── Step: done ──────────────────────────────── */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-semibold text-lg">{t("bulk.importComplete")}</p>
              <p className="text-sm text-zinc-500">
                {importCount !== 1 ? t("bulk.importedCountPlural", { count: importCount }) : t("bulk.importedCount", { count: importCount })}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 flex-wrap gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={onClose}>{t("bulk.cancelBtn")}</Button>
          )}

          {step === "raw" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>{t("bulk.backBtn")}</Button>
              <Button variant="outline" onClick={handleAiClean} disabled={cleaning} className="gap-2">
                {cleaning
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("bulk.cleaning")}</>
                  : <><Sparkles className="h-4 w-4 text-violet-500" /> {t("bulk.cleanWithAi")}</>}
              </Button>
              <Button onClick={() => handleConfirm(cleanRows)} disabled={confirming || cleanRows.length === 0} className="gap-2">
                {confirming
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("bulk.importing")}</>
                  : t("bulk.importAsIs", { count: cleanRows.length })}
              </Button>
            </>
          )}

          {step === "ai" && (
            <>
              <Button variant="outline" onClick={() => setStep("raw")}>{t("bulk.backBtn")}</Button>
              <Button onClick={() => handleConfirm(cleanRows)} disabled={confirming || cleanRows.length === 0} className="gap-2">
                {confirming
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("bulk.importing")}</>
                  : t("bulk.importCleaned", { count: cleanRows.length })}
              </Button>
            </>
          )}

          {step === "done" && (
            <Button onClick={() => { reset(); onClose(); }}>{t("bulk.doneBtn")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row actions dropdown
// ─────────────────────────────────────────────────────────────────────────────

function RowMenu({ name, onView, onEdit, onDelete }: {
  name: string; onView: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const t = useTranslations("contestants");
  const [open, setOpen] = useState(false);

  function pick(fn: () => void) { fn(); setOpen(false); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-sm font-semibold leading-snug line-clamp-2">{name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <button onClick={() => pick(onView)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-zinc-50 text-zinc-700">
              <Eye className="h-4 w-4 text-zinc-400 shrink-0" /> {t("menu.viewDetails")}
            </button>
            <button onClick={() => pick(onEdit)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-zinc-50 text-zinc-700">
              <Pencil className="h-4 w-4 text-zinc-400 shrink-0" /> {t("menu.edit")}
            </button>
            <div className="border-t mx-5 my-1" />
            <button onClick={() => pick(onDelete)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-red-50 text-red-600">
              <Trash2 className="h-4 w-4 shrink-0" /> {t("menu.delete")}
            </button>
          </div>
          <div className="px-5 pb-4">
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>{t("menu.cancel")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main list
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function pagerPages(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const left  = Math.max(2, page - delta);
  const right = Math.min(total - 1, page + delta);
  const pages: (number | "…")[] = [1];
  if (left > 2)        pages.push("…");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

export function ContestantsClient({ contingents }: { contingents: Contingent[] }) {
  const t = useTranslations("contestants");
  const [tab, setTab]               = useState<EduLevel | "ALL">("ALL");
  const [q, setQ]                   = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [ppkiOnly, setPpkiOnly]     = useState(false);
  const [page, setPage]             = useState(1);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [total, setTotal]           = useState(0);
  const [tabCounts, setTabCounts]   = useState({ ALL: 0, PRIMARY: 0, SECONDARY: 0, YOUTH: 0 });
  const [loading, setLoading]       = useState(false);
  const [addOpen, setAddOpen]       = useState(false);
  const [bulkOpen, setBulkOpen]     = useState(false);
  const [viewing, setViewing]       = useState<Contestant | null>(null);
  const [editing, setEditing]       = useState<Contestant | null>(null);

  const fetchContestants = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q)              params.set("q", q);
    if (tab !== "ALL")  params.set("eduLevel", tab);
    if (ppkiOnly)       params.set("ppki", "true");
    params.set("page",     String(page));
    params.set("pageSize", String(PAGE_SIZE));
    try {
      const res = await fetch(`/api/v2/manager/contestants?${params}`);
      const j   = await res.json();
      setContestants(j.data ?? []);
      setTotal(j.total ?? 0);
      if (j.counts) setTabCounts(j.counts);
    } finally {
      setLoading(false);
    }
  }, [q, tab, ppkiOnly, page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchContestants(); }, [fetchContestants]);

  function handleTabChange(key: EduLevel | "ALL") { setTab(key); setPage(1); }
  function handleSearch() { setQ(searchInput); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 justify-center"
            onClick={() => {
              const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href = url; a.download = "contestants-template.csv"; a.click();
              URL.revokeObjectURL(url);
            }}>
            <Download className="h-4 w-4" /> {t("templateBtn")}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 justify-center" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" /> {t("bulkUploadBtn")}
          </Button>
          <Button size="sm" className="gap-1.5 justify-center" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("addBtn")}</span>
          </Button>
        </div>
      </div>

      {/* ── Search ────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <Input
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>{t("searchBtn")}</Button>
      </div>

      {/* ── Tabs + PPKI filter ────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {EDU_TABS.map(({ key, Icon }) => (
            <button
              key={key}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              title={t(`tabs.${key}` as any)}
              onClick={() => handleTabChange(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === key
                  ? "bg-white shadow-sm text-foreground"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={`text-xs tabular-nums ${tab === key ? "text-zinc-600" : "text-zinc-400"}`}>
                {tabCounts[key]}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => { setPpkiOnly((v) => !v); setPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            ppkiOnly
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-zinc-500 border-zinc-200 hover:text-violet-600 hover:border-violet-300"
          }`}
          title="Filter PPKI"
        >
          <Accessibility className="h-4 w-4 shrink-0" />
          <span className="text-xs">PPKI</span>
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────── */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-zinc-50">
              <th className="text-left px-3 py-3 font-medium text-zinc-500 w-10">#</th>
              <th className="px-3 py-3 w-10"></th>
              <th className="text-left px-5 py-3 font-medium text-zinc-500">{t("table.colName")}</th>
              <th className="text-center px-3 py-3 font-medium text-zinc-500 w-16 hidden sm:table-cell">{t("table.colAge")}</th>
              <th className="text-left px-5 py-3 font-medium text-zinc-500 hidden md:table-cell">{t("table.colClass")}</th>
              <th className="px-3 py-3 w-10 hidden md:table-cell"></th>
              <th className="text-right px-5 py-3 font-medium text-zinc-500"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </td>
              </tr>
            )}
            {!loading && contestants.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-zinc-400 text-sm">
                  {t("table.empty")}
                </td>
              </tr>
            )}
            {!loading && contestants.map((c, i) => (
              <tr key={c.id} className="border-t hover:bg-zinc-50 transition-colors">
                <td className="px-3 py-3 text-xs text-zinc-400 text-right tabular-nums w-10">
                  {rangeStart + i}
                </td>
                <td className="px-3 py-3 w-10">
                  <GenderIcon gender={c.gender} />
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium leading-snug">{c.name}</p>
                </td>
                <td className="px-3 py-3 text-center hidden sm:table-cell text-sm text-zinc-500 tabular-nums w-16">
                  {c.age ?? <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-5 py-3 hidden md:table-cell text-zinc-500 text-xs">
                  {CLASS_LABEL(c)}
                </td>
                <td className="px-3 py-3 hidden md:table-cell w-10 text-center">
                  {c.ppki && (
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-600"
                      title="PPKI"
                    >
                      <Accessibility className="h-3.5 w-3.5" />
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end">
                    <RowMenu
                      name={c.name}
                      onView={() => setViewing(c)}
                      onEdit={() => setEditing(c)}
                      onDelete={() => {/* TODO */}}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="border-t px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-zinc-400">
              {t("table.showing", { start: rangeStart, end: rangeEnd, total })}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-1 rounded text-xs border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ←
                </button>
                {pagerPages(page, totalPages).map((p, i) =>
                  p === "…"
                    ? <span key={`e${i}`} className="px-1 text-xs text-zinc-300">…</span>
                    : <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`min-w-[28px] px-2 py-1 rounded text-xs border transition-colors ${
                          p === page
                            ? "bg-[#085782] text-white border-[#085782]"
                            : "border-zinc-200 hover:bg-zinc-50 text-zinc-600"
                        }`}
                      >
                        {p}
                      </button>
                )}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded text-xs border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────── */}
      <ViewDialog contestant={viewing} onClose={() => setViewing(null)} />
      <AddEditDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        contingents={contingents}
        onSaved={fetchContestants}
      />
      <AddEditDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        contingents={contingents}
        initial={editing}
        onSaved={fetchContestants}
      />
      <BulkUploadDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        contingents={contingents}
        onSaved={fetchContestants}
      />
    </div>
  );
}
