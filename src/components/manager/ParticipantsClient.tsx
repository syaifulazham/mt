"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Search, Upload, Download, Plus, Eye, EyeOff, Pencil, Trash2,
  Loader2, CheckCircle2, AlertCircle, Sparkles,
  MoreHorizontal, Users, BookOpen, GraduationCap, Zap, Accessibility,
  KeyRound, ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

type Contingent = { id: string; name: string };
type EduLevel   = "KINDERGARTEN" | "PRIMARY" | "SECONDARY" | "YOUTH";
type Gender     = "MALE" | "FEMALE";
type Ethnicity  = "MELAYU" | "CINA" | "INDIA" | "ORANG_ASLI_SEMENANJUNG" | "BUMIPUTRA_SABAH" | "BUMIPUTRA_SARAWAK" | "LAIN_LAIN";

const ETHNICITY_OPTIONS: { value: Ethnicity; label: string }[] = [
  { value: "MELAYU",               label: "Melayu" },
  { value: "CINA",                 label: "Cina" },
  { value: "INDIA",                label: "India" },
  { value: "ORANG_ASLI_SEMENANJUNG", label: "Orang Asli Semenanjung" },
  { value: "BUMIPUTRA_SABAH",      label: "Bumiputra Sabah" },
  { value: "BUMIPUTRA_SARAWAK",    label: "Bumiputra Sarawak" },
  { value: "LAIN_LAIN",            label: "Lain-lain" },
];

type Participant = {
  id: string; name: string; ic: string | null; email: string | null;
  phoneNumber: string | null; gender: Gender; age: number | null;
  eduLevel: EduLevel; classGrade: string | null; className: string | null;
  ethnicity: Ethnicity | null;
  status: string; ppki: boolean; hasPassword: boolean;
};

/** Derive gender, age, eduLevel, classGrade from a 12-digit Malaysian IC. */
function parseIcData(ic: string): { gender?: Gender; age?: number; eduLevel?: EduLevel; classGrade?: string } {
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) return {};

  const yy = parseInt(digits.substring(0, 2), 10);
  const mm = parseInt(digits.substring(2, 4), 10);
  const dd = parseInt(digits.substring(4, 6), 10);
  const genderDigit = parseInt(digits[11], 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return {};

  const currentYear = new Date().getFullYear();
  const currentYY   = currentYear % 100;
  const birthYear   = yy <= currentYY ? 2000 + yy : 1900 + yy;
  const age         = currentYear - birthYear;

  const gender: Gender = genderDigit % 2 === 1 ? "MALE" : "FEMALE";

  let eduLevel: EduLevel;
  let classGrade: string | undefined;
  if (age >= 5 && age <= 6) {
    eduLevel   = "KINDERGARTEN";
    classGrade = age <= 5 ? "Prasekolah 5thn" : "Prasekolah 6thn";
  } else if (age >= 7 && age <= 12) {
    eduLevel   = "PRIMARY";
    classGrade = `Darjah ${age - 6}`;
  } else if (age >= 13 && age <= 17) {
    eduLevel   = "SECONDARY";
    classGrade = `Tingkatan ${age - 12}`;
  } else {
    eduLevel = "YOUTH";
  }

  return { gender, age, eduLevel, classGrade };
}

/** Derive the expected class grade from a numeric age and known education level. */
function gradeForAge(age: number, level: EduLevel): string {
  if (level === "KINDERGARTEN") return age <= 5 ? "Prasekolah 5thn" : "Prasekolah 6thn";
  if (level === "PRIMARY")      return `Darjah ${Math.min(Math.max(age - 6, 1), 6)}`;
  if (level === "SECONDARY")    return `Tingkatan ${Math.min(Math.max(age - 12, 1), 5)}`;
  return "";
}

/** Derive eduLevel from age (matches parseIcData logic). */
function eduLevelForAge(age: number): EduLevel {
  if (age >= 5  && age <= 6)  return "KINDERGARTEN";
  if (age >= 7  && age <= 12) return "PRIMARY";
  if (age >= 13 && age <= 17) return "SECONDARY";
  return "YOUTH";
}

const EDU_TABS: { key: EduLevel | "ALL"; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "ALL",          Icon: Users         },
  { key: "KINDERGARTEN", Icon: Zap           },
  { key: "PRIMARY",      Icon: BookOpen      },
  { key: "SECONDARY",    Icon: GraduationCap },
  { key: "YOUTH",        Icon: Zap           },
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

const CLASS_LABEL = (p: Participant) =>
  [p.classGrade, p.className].filter(Boolean).join(" – ") || "–";

// ── CSV template ──────────────────────────────────────────────────────────────
const CSV_TEMPLATE = `name,ic,gender,age,edu_level,class_grade,class_name,email,phoneNumber,ethnicity
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

function ViewDialog({ participant, onClose }: { participant: Participant | null; onClose: () => void }) {
  const t = useTranslations("participants");
  const [icRevealed, setIcRevealed] = useState(false);

  // Reset mask whenever a different participant is opened
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIcRevealed(false); }, [participant?.id]);

  if (!participant) return null;
  const p = participant;

  const avatar = p.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const rows: [string, string | null | undefined][] = [
    [t("view.age"),       p.age != null ? t("view.ageValue", { age: p.age }) : null],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [t("view.education"), t(`edu.${p.eduLevel}` as any)],
    [t("view.class"),     CLASS_LABEL(p) !== "–" ? CLASS_LABEL(p) : null],
    [t("view.email"),     p.email],
    [t("view.phone"),     p.phoneNumber],
  ];

  return (
    <Dialog open={!!participant} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{t("view.title")}</DialogTitle>
        </DialogHeader>

        {/* Avatar + name hero */}
        <div className="flex flex-col items-center gap-2 py-5 mx-6 border-b dark:border-zinc-800">
          <div
            className={`h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold text-white
              ${p.gender === "MALE" ? "bg-blue-500" : "bg-pink-500"}`}
          >
            {avatar}
          </div>
          <p className="font-semibold text-base text-center leading-snug">{p.name}</p>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${GENDER_COLOR[p.gender]}`}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {t(`gender.${p.gender}` as any)}
          </span>
        </div>

        {/* Detail grid */}
        <div className="px-6 py-4 space-y-0">
          {/* IC row — masked by default */}
          <div className="grid grid-cols-[120px_1fr] gap-2 py-2.5 border-b dark:border-zinc-800">
            <span className="text-xs text-zinc-400 self-center">{t("view.ic")}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium font-mono tracking-wider">
                {p.ic
                  ? (icRevealed ? p.ic : maskIc(p.ic))
                  : <span className="text-zinc-300 font-normal font-sans">—</span>}
              </span>
              {p.ic && (
                <button
                  onClick={() => setIcRevealed((v) => !v)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
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
            <div key={label} className="grid grid-cols-[120px_1fr] gap-2 py-2.5 border-b last:border-0 dark:border-zinc-800">
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
  KINDERGARTEN: ["Prasekolah 5thn", "Prasekolah 6thn"],
  PRIMARY:      ["Darjah 1","Darjah 2","Darjah 3","Darjah 4","Darjah 5","Darjah 6"],
  SECONDARY:    ["Tingkatan 1","Tingkatan 2","Tingkatan 3","Tingkatan 4","Tingkatan 5"],
  YOUTH:        [],
};

function AddEditDialog({
  open, onClose, contingents, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contingents: Contingent[];
  initial?: Participant | null;
  onSaved: () => void;
}) {
  const t = useTranslations("participants");
  const isEdit = !!initial?.id;

  const defaultForm = {
    contingentId: contingents[0]?.id ?? "",
    name: "", ic: "", gender: "MALE" as Gender, age: "",
    eduLevel: "SECONDARY" as EduLevel,
    classGrade: "", className: "", email: "", phoneNumber: "",
    ethnicity: "" as Ethnicity | "",
    status: "ACTIVE", ppki: false,
  };

  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // Sync form when dialog opens with a new participant
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
          ethnicity:   (initial.ethnicity  ?? "") as Ethnicity | "",
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

  function handleIcChange(ic: string) {
    set("ic", ic);
    const derived = parseIcData(ic);
    if (derived.gender)    set("gender", derived.gender);
    if (derived.age !== undefined) set("age", String(derived.age));
    if (derived.eduLevel) {
      set("eduLevel", derived.eduLevel);
      set("classGrade", derived.classGrade ?? "");
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(t("form.nameRequired")); return; }
    setSaving(true); setError("");
    try {
      const url    = isEdit ? `/api/v2/manager/participants/${initial!.id}` : "/api/v2/manager/participants";
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
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 dark:border-zinc-700">
            <span className="text-sm font-medium">{t("form.ppkiLabel")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={form.ppki}
                onClick={() => set("ppki", !form.ppki)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors focus-visible:outline-none
                  ${form.ppki ? "bg-[#085782]" : "bg-zinc-200 dark:bg-zinc-700"}`}
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
            <Input
              value={form.ic}
              onChange={(e) => handleIcChange(e.target.value)}
              placeholder="010101012345"
              maxLength={14}
            />
            <p className="text-[11px] text-zinc-400">Jantina, umur & pendidikan akan diisi automatik dari IC 12 digit.</p>
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
              <Input type="number" min="1" value={form.age}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = parseInt(raw, 10);
                  if (!isNaN(n) && n > 0) {
                    const lvl = eduLevelForAge(n);
                    setForm((f) => ({ ...f, age: raw, eduLevel: lvl, classGrade: gradeForAge(n, lvl) }));
                  } else {
                    set("age", raw);
                  }
                }}
                placeholder="13" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("form.eduLabel")}</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.eduLevel}
              onChange={(e) => {
                const lvl = e.target.value as EduLevel;
                const n = parseInt(form.age, 10);
                const grade = !isNaN(n) && n > 0 ? gradeForAge(n, lvl) : "";
                setForm((f) => ({ ...f, eduLevel: lvl, classGrade: grade }));
              }}>
              <option value="KINDERGARTEN">{t("form.eduKindergarten")}</option>
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

          <div className="space-y-1.5">
            <Label className="text-sm">Bangsa / Etnik</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.ethnicity}
              onChange={(e) => set("ethnicity", e.target.value)}
            >
              <option value="">— Pilih bangsa —</option>
              {ETHNICITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400">Pilihan: Melayu, Cina, India, Orang Asli Semenanjung, Bumiputra Sabah, Bumiputra Sarawak, Lain-lain</p>
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
  kindergarten: "KINDERGARTEN", prasekolah: "KINDERGARTEN", tadika: "KINDERGARTEN",
  primary: "PRIMARY", rendah: "PRIMARY", "sekolah rendah": "PRIMARY",
  darjah: "PRIMARY", std: "PRIMARY",
  secondary: "SECONDARY", menengah: "SECONDARY", "sekolah menengah": "SECONDARY",
  tingkatan: "SECONDARY", form: "SECONDARY",
  youth: "YOUTH", belia: "YOUTH", open: "YOUTH", tertiary: "YOUTH",
};

type RawRow = {
  name: string; ic: string; gender: string; age: string;
  edu_level: string; class_grade: string; class_name: string;
  email: string; phoneNumber: string; ethnicity: string;
  _issues: string[];
};

type CleanRow = {
  name: string; ic: string | null; gender: Gender; age: number | null;
  eduLevel: EduLevel; classGrade: string | null; className: string | null;
  email: string | null; phoneNumber: string | null;
  ethnicity: Ethnicity | null; contingentId: string;
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
    const email       = get("email");
    const phoneNumber = get("phonenumber") || get("phone_number") || get("phone");
    const ethnicity   = get("ethnicity") || get("bangsa") || get("etnik");
    const issues: string[] = [];
    if (!name) issues.push("name");
    const gNorm = gender.toUpperCase();
    if (gNorm !== "MALE" && gNorm !== "FEMALE") issues.push("gender");
    const ednorm = edu_level.toLowerCase().trim();
    if (!EDU_MAP[ednorm] && !["kindergarten","primary","secondary","youth"].includes(ednorm)) issues.push("edu_level");
    return { name, ic, gender, age, edu_level, class_grade, class_name, email, phoneNumber, ethnicity, _issues: issues };
  });
}

const ETHNICITY_MAP: Record<string, Ethnicity> = {
  melayu: "MELAYU", malay: "MELAYU",
  cina: "CINA", chinese: "CINA",
  india: "INDIA", indian: "INDIA", tamil: "INDIA",
  orang_asli_semenanjung: "ORANG_ASLI_SEMENANJUNG", "orang asli": "ORANG_ASLI_SEMENANJUNG", asli: "ORANG_ASLI_SEMENANJUNG",
  bumiputra_sabah: "BUMIPUTRA_SABAH", "bumiputra sabah": "BUMIPUTRA_SABAH", kadazan: "BUMIPUTRA_SABAH", dusun: "BUMIPUTRA_SABAH", bajau: "BUMIPUTRA_SABAH",
  bumiputra_sarawak: "BUMIPUTRA_SARAWAK", "bumiputra sarawak": "BUMIPUTRA_SARAWAK", iban: "BUMIPUTRA_SARAWAK", bidayuh: "BUMIPUTRA_SARAWAK",
  lain_lain: "LAIN_LAIN", "lain-lain": "LAIN_LAIN", other: "LAIN_LAIN", lain: "LAIN_LAIN",
};

function rawToClean(rows: RawRow[], contingentId: string): CleanRow[] {
  return rows.map((r) => {
    const gNorm = r.gender.toUpperCase();
    const gender: Gender = (gNorm === "FEMALE") ? "FEMALE" : "MALE";
    const ednorm = r.edu_level.toLowerCase().trim();
    const eduLevel: EduLevel = EDU_MAP[ednorm] ?? "SECONDARY";
    const ethKey = r.ethnicity.toLowerCase().trim().replace(/\s+/g, "_");
    const ethnicity: Ethnicity | null =
      (ETHNICITY_MAP[ethKey] ?? ETHNICITY_MAP[r.ethnicity.toLowerCase().trim()]) ?? null;
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
      ethnicity,
      contingentId,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview table (must be top-level to satisfy react-hooks/static-components)
// ─────────────────────────────────────────────────────────────────────────────

function PreviewTable({ rows }: { rows: CleanRow[]; isAi?: boolean }) {
  const t = useTranslations("participants");
  const headers = [
    t("bulk.colName"), t("bulk.colIc"), t("bulk.colGender"),
    t("bulk.colAge"), t("bulk.colLevel"), t("bulk.colGrade"),
    t("bulk.colClass"), t("bulk.colEmail"),
  ];
  return (
    <div className="overflow-x-auto rounded-lg border text-xs dark:border-zinc-700">
      <table className="w-full">
        <thead className="bg-zinc-50 dark:bg-zinc-800">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium text-zinc-500 dark:text-zinc-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
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
  const t = useTranslations("participants");
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

  async function handleAiClean() {
    setCleaning(true); setError(""); setAiErrors([]);
    try {
      const res = await fetch("/api/v2/manager/participants/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, contingentId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "AI parse failed");
      setCleanRows(j.data);
      setAiErrors(j.errors ?? []);
      setStep("ai");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleaning(false);
    }
  }

  async function handleConfirm(rows: CleanRow[]) {
    setConfirming(true); setError("");
    try {
      const res = await fetch("/api/v2/manager/participants/bulk-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, contingentId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Import failed"); }
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

        <div className="flex items-center gap-2 text-xs text-zinc-400 px-1">
          {(["upload","raw","ai","done"] as BulkStep[]).map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span>›</span>}
              <span className={step === s ? "text-[#085782] font-semibold dark:text-blue-400" : ""}>
                {s === "upload" ? t("bulk.stepUpload") : s === "raw" ? t("bulk.stepPreview") : s === "ai" ? t("bulk.stepAiClean") : t("bulk.stepDone")}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">

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
                className="border-2 border-dashed border-zinc-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#085782]/50 transition-colors dark:border-zinc-700 dark:hover:border-blue-500/50"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-zinc-300 mb-3" />
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{t("bulk.clickToChoose")}</p>
                <p className="text-xs text-zinc-400 mt-1">{t("bulk.noServerCall")}</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </div>
              <Button variant="outline" size="sm" className="gap-2"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = "data:text/csv," + encodeURIComponent(CSV_TEMPLATE);
                  a.download = "participants-template.csv"; a.click();
                }}>
                <Download className="h-4 w-4" /> {t("bulk.downloadTemplate")}
              </Button>
            </>
          )}

          {step === "raw" && (
            <>
              <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                issueCount > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400" : "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400"
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

          {step === "ai" && (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-700 dark:bg-violet-950/20 dark:text-violet-400">
                <Sparkles className="h-4 w-4 shrink-0" />
                {cleanRows.length !== 1 ? t("bulk.aiCleanedPlural", { count: cleanRows.length }) : t("bulk.aiCleaned", { count: cleanRows.length })}
              </div>
              {aiErrors.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1 dark:bg-amber-950/20 dark:border-amber-800">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t("bulk.excludedTitle")}</p>
                  {aiErrors.map((e, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-500">{e}</p>)}
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

function RowMenu({ name, hasPassword, onView, onEdit, onDelete, onGenPassword }: {
  name: string; hasPassword: boolean;
  onView: () => void; onEdit: () => void; onDelete: () => void; onGenPassword: () => void;
}) {
  const t = useTranslations("participants");
  const [open, setOpen] = useState(false);

  function pick(fn: () => void) { fn(); setOpen(false); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b dark:border-zinc-800">
            <DialogTitle className="text-sm font-semibold leading-snug line-clamp-2">{name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <button onClick={() => pick(onView)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-zinc-50 text-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300">
              <Eye className="h-4 w-4 text-zinc-400 shrink-0" /> {t("menu.viewDetails")}
            </button>
            <button onClick={() => pick(onEdit)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-zinc-50 text-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300">
              <Pencil className="h-4 w-4 text-zinc-400 shrink-0" /> {t("menu.edit")}
            </button>
            <button onClick={() => pick(onGenPassword)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-zinc-50 text-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300">
              <KeyRound className="h-4 w-4 text-zinc-400 shrink-0" />
              {hasPassword ? t("menu.resetPassword") : t("menu.generatePassword")}
            </button>
            <div className="border-t mx-5 my-1 dark:border-zinc-800" />
            <button onClick={() => pick(onDelete)}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-red-50 text-red-600 dark:hover:bg-red-950/20">
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
// Generate Passwords — bulk dialog
// ─────────────────────────────────────────────────────────────────────────────

type GenResult = { id: string; name: string; initialPassword: string };

function GeneratePasswordsDialog({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("participants");
  const [step, setStep] = useState<"options" | "working" | "done">("options");
  const [mode, setMode] = useState<"skip" | "reset">("skip");
  const [results, setResults] = useState<GenResult[]>([]);
  const [skipped, setSkipped] = useState(0);

  function reset() { setStep("options"); setMode("skip"); setResults([]); setSkipped(0); }

  async function run() {
    setStep("working");
    try {
      const res = await fetch("/api/v2/manager/participants/generate-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const j = await res.json();
      setResults(j.data ?? []);
      setSkipped(j.skipped ?? 0);
      setStep("done");
      onSaved();
    } catch {
      setStep("options");
    }
  }

  function downloadCsv() {
    const header = "Name,Initial Password,Note";
    const rows = results.map(r =>
      `"${r.name.replace(/"/g, '""')}","${r.initialPassword}","Use your IC number as User ID"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "participant-passwords.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {t("genPw.title")}
          </DialogTitle>
          <DialogDescription>{t("genPw.desc")}</DialogDescription>
        </DialogHeader>

        {step === "options" && (
          <div className="space-y-4 py-4 px-1">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("genPw.modeLabel")}</p>
            <div className="space-y-3">
              {(["skip", "reset"] as const).map((m) => (
                <label key={m} className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  mode === m
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-600"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                }`}>
                  <input
                    type="radio" name="gen-mode" value={m}
                    checked={mode === m} onChange={() => setMode(m)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium dark:text-zinc-200">{t(`genPw.mode_${m}_title`)}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t(`genPw.mode_${m}_desc`)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === "working" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <p className="text-sm text-zinc-500">{t("genPw.working")}</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t("genPw.doneMsg", { count: results.length, skipped })}
            </div>
            {results.length > 0 && (
              <>
                <div className="rounded-lg border dark:border-zinc-700 overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-zinc-500">{t("genPw.colName")}</th>
                        <th className="text-left px-3 py-2 font-medium text-zinc-500">{t("genPw.colPassword")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id} className="border-t dark:border-zinc-700">
                          <td className="px-3 py-2 dark:text-zinc-200">{r.name}</td>
                          <td className="px-3 py-2 font-mono dark:text-zinc-200">{r.initialPassword}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("genPw.csvNote")}</p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "options" && (
            <>
              <Button variant="outline" onClick={() => { reset(); onClose(); }}>{t("bulk.cancelBtn")}</Button>
              <Button onClick={run}>{t("genPw.generateBtn")}</Button>
            </>
          )}
          {step === "done" && (
            <>
              {results.length > 0 && (
                <Button variant="outline" onClick={downloadCsv}>
                  <Download className="h-4 w-4 mr-1.5" /> {t("genPw.downloadBtn")}
                </Button>
              )}
              <Button onClick={() => { reset(); onClose(); }}>{t("bulk.doneBtn")}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate Password — single participant dialog
// ─────────────────────────────────────────────────────────────────────────────

function SingleGeneratePasswordDialog({ participant, onClose, onSaved }: {
  participant: Participant | null; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("participants");
  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState<GenResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  function reset() { setSaving(false); setResult(null); setError(null); }

  async function generate() {
    if (!participant) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/v2/manager/participants/generate-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: [participant.id], mode: "reset" }),
      });
      const j = await res.json();
      if (j.data?.[0]) { setResult(j.data[0]); onSaved(); }
      else setError(t("genPw.errorNoIc"));
    } catch {
      setError(t("genPw.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!participant} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {participant?.hasPassword ? t("menu.resetPassword") : t("menu.generatePassword")}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{participant?.name}</DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {participant?.hasPassword ? t("genPw.singleResetConfirm") : t("genPw.singleGenConfirm")}
            </p>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("genPw.singleDone")}
            </div>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border dark:border-zinc-700 px-4 py-3 space-y-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("genPw.colPassword")}</p>
              <p className="text-lg font-mono font-bold dark:text-zinc-100 tracking-wider">{result.initialPassword}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("genPw.csvNote")}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => { reset(); onClose(); }}>{t("bulk.cancelBtn")}</Button>
              <Button onClick={generate} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t("genPw.working")}</> : t("genPw.generateBtn")}
              </Button>
            </>
          ) : (
            <Button onClick={() => { reset(); onClose(); }}>{t("bulk.doneBtn")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

export function ParticipantsClient({ contingents }: { contingents: Contingent[] }) {
  const t = useTranslations("participants");
  const [tab, setTab]               = useState<EduLevel | "ALL">("ALL");
  const [q, setQ]                   = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [ppkiOnly, setPpkiOnly]     = useState(false);
  const [noPassword, setNoPassword] = useState(false);
  const [page, setPage]             = useState(1);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [total, setTotal]           = useState(0);
  const [tabCounts, setTabCounts]   = useState<Record<EduLevel | "ALL", number>>({ ALL: 0, KINDERGARTEN: 0, PRIMARY: 0, SECONDARY: 0, YOUTH: 0 });
  const [loading, setLoading]       = useState(false);
  const [addOpen, setAddOpen]       = useState(false);
  const [bulkOpen, setBulkOpen]     = useState(false);
  const [genPwOpen, setGenPwOpen]   = useState(false);
  const [singleGenTarget, setSingleGenTarget] = useState<Participant | null>(null);
  const [viewing, setViewing]       = useState<Participant | null>(null);

  // ── Header action menu ──────────────────────────────────────────────────
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node))
        setHeaderMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Bulk delete state ───────────────────────────────────────────────────
  const [bulkDeleteMode, setBulkDeleteMode]   = useState(false);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen]   = useState(false);
  const [bulkDeleteCode, setBulkDeleteCode]   = useState("");
  const [bulkDeleteInput, setBulkDeleteInput] = useState("");
  const [bulkDeleting, setBulkDeleting]       = useState(false);

  function enterBulkDelete() { setBulkDeleteMode(true); setSelectedIds(new Set()); }
  function exitBulkDelete()  { setBulkDeleteMode(false); setSelectedIds(new Set()); }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allOnPageSelected =
    participants.length > 0 && participants.every((p) => selectedIds.has(p.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        participants.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        participants.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }

  function openBulkDeleteConfirm() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code  = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setBulkDeleteCode(code);
    setBulkDeleteInput("");
    setBulkDeleteOpen(true);
  }

  async function handleBulkDelete() {
    if (bulkDeleteInput !== bulkDeleteCode) return;
    setBulkDeleting(true);
    try {
      await fetch("/api/v2/manager/participants/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setBulkDeleteOpen(false);
      exitBulkDelete();
      fetchParticipants();
    } finally {
      setBulkDeleting(false);
    }
  }
  const [editing, setEditing]       = useState<Participant | null>(null);

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q)              params.set("q", q);
    if (tab !== "ALL")  params.set("eduLevel", tab);
    if (ppkiOnly)       params.set("ppki", "true");
    if (noPassword)     params.set("noPassword", "true");
    params.set("page",     String(page));
    params.set("pageSize", String(PAGE_SIZE));
    try {
      const res = await fetch(`/api/v2/manager/participants?${params}`);
      const j   = await res.json();
      setParticipants(j.data ?? []);
      setTotal(j.total ?? 0);
      if (j.counts) setTabCounts(j.counts);
    } finally {
      setLoading(false);
    }
  }, [q, tab, ppkiOnly, noPassword, page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchParticipants(); }, [fetchParticipants]);

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
          <h1 className="text-xl font-bold dark:text-zinc-100">{t("title")}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t("subtitle")}</p>
        </div>

        {/* Participant portal login note */}
        <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <span className="shrink-0">🔗</span>
          <span>
            {t("portalNote")}{" "}
            <a
              href="/participant/sign-in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-semibold underline underline-offset-2 hover:text-blue-900"
            >
              {process.env.NEXT_PUBLIC_APP_URL ?? ""}/participant/sign-in
            </a>
            {" — "}{t("portalNoteIc")}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 justify-center"
            onClick={() => {
              const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href = url; a.download = "participants-template.csv"; a.click();
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
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {EDU_TABS.map(({ key, Icon }) => (
            <button
              key={key}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              title={t(`tabs.${key}` as any)}
              onClick={() => handleTabChange(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === key
                  ? "bg-white shadow-sm text-foreground dark:bg-zinc-700"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
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
              : "bg-white text-zinc-500 border-zinc-200 hover:text-violet-600 hover:border-violet-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
          }`}
          title="Filter PPKI"
        >
          <Accessibility className="h-4 w-4 shrink-0" />
          <span className="text-xs">PPKI</span>
        </button>

        <button
          onClick={() => { setNoPassword((v) => !v); setPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            noPassword
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-zinc-500 border-zinc-200 hover:text-red-600 hover:border-red-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
          }`}
          title={t("noPasswordFilter")}
        >
          <ShieldOff className="h-4 w-4 shrink-0" />
          <span className="text-xs">{t("noPasswordFilter")}</span>
        </button>
      </div>

      {/* ── Bulk delete alert banner ─────────────────── */}
      {bulkDeleteMode && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <Trash2 className="h-4 w-4 shrink-0" />
            {t("bulkDelete.modeAlert", { count: selectedIds.size })}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs" onClick={openBulkDeleteConfirm}>
                <Trash2 className="h-3.5 w-3.5" />
                {t("bulkDelete.deleteSelected", { count: selectedIds.size })}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exitBulkDelete}>
              {t("bulkDelete.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────── */}
      <div className="rounded-xl border bg-white overflow-hidden dark:bg-zinc-900 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-zinc-50 dark:bg-zinc-800/50 dark:border-zinc-800">
              <th className="text-left px-3 py-3 font-medium text-zinc-500 dark:text-zinc-400 w-10">
                {bulkDeleteMode ? (
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer accent-red-600"
                    title="Select all"
                  />
                ) : "#"}
              </th>
              <th className="px-3 py-3 w-10"></th>
              <th className="text-left px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400">{t("table.colName")}</th>
              <th className="text-center px-3 py-3 font-medium text-zinc-500 dark:text-zinc-400 w-16 hidden sm:table-cell">{t("table.colAge")}</th>
              <th className="text-left px-5 py-3 font-medium text-zinc-500 dark:text-zinc-400 hidden md:table-cell">{t("table.colClass")}</th>
              <th className="px-3 py-3 w-10 hidden md:table-cell"></th>
              <th className="text-right px-3 py-3 w-10">
                {!bulkDeleteMode && (
                  <div className="relative inline-block text-left" ref={headerMenuRef}>
                    <button
                      onClick={() => setHeaderMenuOpen((v) => !v)}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {headerMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-white dark:bg-zinc-900 dark:border-zinc-700 shadow-lg z-20 py-1">
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          onClick={() => { setHeaderMenuOpen(false); setGenPwOpen(true); }}
                        >
                          <KeyRound className="h-4 w-4" />
                          {t("genPwBtn")}
                        </button>
                        <hr className="my-1 border-zinc-100 dark:border-zinc-700" />
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => { setHeaderMenuOpen(false); enterBulkDelete(); }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("bulkDelete.menuLabel")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </th>
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
            {!loading && participants.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-zinc-400 text-sm">
                  {t("table.empty")}
                </td>
              </tr>
            )}
            {!loading && participants.map((p, i) => (
              <tr
                key={p.id}
                className={`border-t transition-colors dark:border-zinc-800 ${
                  bulkDeleteMode && selectedIds.has(p.id)
                    ? "bg-red-50 dark:bg-red-950/20"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <td className="px-3 py-3 text-xs text-zinc-400 text-right tabular-nums w-10">
                  {bulkDeleteMode ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="h-4 w-4 cursor-pointer accent-red-600"
                    />
                  ) : rangeStart + i}
                </td>
                <td className="px-3 py-3 w-10">
                  <GenderIcon gender={p.gender} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium leading-snug">{p.name}</p>
                    {!p.hasPassword && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100 dark:border-red-900/40 px-2 py-0.5 text-[10px] font-medium">
                        <ShieldOff className="h-3 w-3" /> {t("noPassword")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-center hidden sm:table-cell text-sm text-zinc-500 tabular-nums w-16">
                  {p.age ?? <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-5 py-3 hidden md:table-cell text-zinc-500 text-xs dark:text-zinc-400">
                  {CLASS_LABEL(p)}
                </td>
                <td className="px-3 py-3 hidden md:table-cell w-10 text-center">
                  {p.ppki && (
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
                      name={p.name}
                      hasPassword={p.hasPassword}
                      onView={() => setViewing(p)}
                      onEdit={() => setEditing(p)}
                      onDelete={() => {/* TODO */}}
                      onGenPassword={() => setSingleGenTarget(p)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="border-t px-5 py-3 flex flex-wrap items-center justify-between gap-3 dark:border-zinc-800">
            <span className="text-xs text-zinc-400">
              {t("table.showing", { start: rangeStart, end: rangeEnd, total })}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-1 rounded text-xs border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300"
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
                            : "border-zinc-200 hover:bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {p}
                      </button>
                )}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded text-xs border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300"
                >
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────── */}
      <ViewDialog participant={viewing} onClose={() => setViewing(null)} />
      <AddEditDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        contingents={contingents}
        onSaved={fetchParticipants}
      />
      <AddEditDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        contingents={contingents}
        initial={editing}
        onSaved={fetchParticipants}
      />
      <BulkUploadDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        contingents={contingents}
        onSaved={fetchParticipants}
      />
      <GeneratePasswordsDialog
        open={genPwOpen}
        onClose={() => setGenPwOpen(false)}
        onSaved={fetchParticipants}
      />
      <SingleGeneratePasswordDialog
        participant={singleGenTarget}
        onClose={() => setSingleGenTarget(null)}
        onSaved={fetchParticipants}
      />

      {/* ── Bulk delete confirmation dialog ─────────── */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(v) => { if (!bulkDeleting) setBulkDeleteOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> {t("bulkDelete.confirmTitle", { count: selectedIds.size })}
            </DialogTitle>
            <DialogDescription>
              {t("bulkDelete.confirmDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-center">
              <p className="text-xs text-zinc-500 mb-1">{t("bulkDelete.typeCode")}</p>
              <p className="text-2xl font-mono font-bold tracking-[0.3em] text-red-600">{bulkDeleteCode}</p>
            </div>
            <input
              type="text"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono tracking-widest text-center uppercase"
              placeholder={bulkDeleteCode.split("").map(() => "_").join(" ")}
              value={bulkDeleteInput}
              onChange={(e) => setBulkDeleteInput(e.target.value.toUpperCase())}
              maxLength={5}
              disabled={bulkDeleting}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
              {t("bulkDelete.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteInput !== bulkDeleteCode || bulkDeleting}
              onClick={handleBulkDelete}
              className="gap-1.5"
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("bulkDelete.confirmBtn", { count: selectedIds.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
