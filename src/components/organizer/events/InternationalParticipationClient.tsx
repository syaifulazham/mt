"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Globe2, School, Users, UserCog, Trophy, Lock, Search,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ISO_COUNTRIES, flagEmoji } from "@/lib/countries";
import { ageFromBirthDate, eduLevelForAge, gradeForAge } from "@/lib/participantAge";

// ─── Types ───────────────────────────────────────────────────────────────────

type Country = { id: string; name: string; codeIso2: string };
type SchoolRow = {
  id: string; name: string; shortName: string | null; countryId: string | null;
  participants: number; trainers: number; teams: number; enrolled: number;
};
type Participant = {
  id: string; name: string; passport: string | null; birthDate: string | null;
  gender: "MALE" | "FEMALE"; age: number | null; eduLevel: string; classGrade: string | null;
  email: string | null; phoneNumber: string | null; ppki: boolean; teamCount: number;
};
type Trainer = { id: string; name: string; passport: string | null; email: string | null; phoneNumber: string | null };
type Team = {
  id: string; name: string; competitionId: string;
  members: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  entry: { acceptance: string; selected: boolean } | null;
  locked: boolean;
};
type Competition = {
  id: string; code: string; name: string; participationType: "TEAM" | "INDIVIDUAL";
  minTeamSize: number; maxTeamSize: number; eligibleParticipantIds: string[];
};
type SchoolDetail = {
  contingent: { id: string; name: string };
  participants: Participant[]; trainers: Trainer[]; teams: Team[]; competitions: Competition[];
};

const ERRORS: Record<string, string> = {
  FORBIDDEN:                  "Hanya ADMIN dan SUPER_ADMIN boleh mengurus penyertaan antarabangsa.",
  MISSING_NAME:               "Nama diperlukan.",
  MISSING_PASSPORT:           "No. pasport diperlukan.",
  INVALID_BIRTH_DATE:         "Tarikh lahir tidak sah.",
  INVALID_GENDER:             "Pilih jantina.",
  INVALID_EDU_LEVEL:          "Pilih tahap pendidikan.",
  INVALID_EMAIL:              "Alamat e-mel tidak sah.",
  DUPLICATE_PASSPORT:         "No. pasport ini sudah didaftarkan untuk sekolah ini.",
  PARTICIPANT_IN_TEAM:        "Peserta ini berada dalam pasukan. Keluarkan daripada pasukan dahulu.",
  CONTINGENT_NOT_EMPTY:       "Sekolah ini masih mempunyai peserta, jurulatih atau pasukan.",
  NO_MEMBERS:                 "Pilih sekurang-kurangnya seorang peserta.",
  TEAM_FULL:                  "Bilangan ahli melebihi had pertandingan.",
  TEAM_TOO_SMALL:             "Bilangan ahli kurang daripada minimum pertandingan.",
  MEMBER_NOT_ELIGIBLE:        "Peserta tidak layak (kumpulan sasaran) untuk pertandingan ini",
  PARTICIPANT_IN_SAME_EVENT:  "Peserta sudah menyertai pertandingan lain dalam acara ini (Penyertaan Tunggal)",
  TEAM_LOCKED:                "Pasukan telah dipilih dalam Pra-Pendaftaran dan dikunci.",
  TEAM_IN_OTHER_EVENT:        "Pasukan ini juga berada dalam acara lain dan tidak boleh dipadam.",
  TEAM_HAS_SCORES:            "Pasukan ini sudah mempunyai markah penghakiman.",
  COMPETITION_NOT_IN_EVENT:   "Pertandingan ini tidak ditawarkan dalam acara ini.",
  UNKNOWN_COUNTRY:            "Negara tidak dikenali.",
};

function errorText(e: { error?: string; detail?: string } | null | undefined): string {
  if (!e?.error) return "Ralat tidak dijangka.";
  const base = ERRORS[e.error] ?? e.error;
  return e.detail ? `${base}: ${e.detail}` : base;
}

async function api<T = unknown>(url: string, method = "GET", body?: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: errorText(json) };
    return { ok: true, data: (json?.data ?? json) as T };
  } catch {
    return { ok: false, message: "Ralat rangkaian." };
  }
}

const EDU_LABEL: Record<string, string> = {
  KINDERGARTEN: "Prasekolah", PRIMARY: "Rendah", SECONDARY: "Menengah", YOUTH: "Belia",
};
// Same values and colours as the Penerimaan select in Pra-Pendaftaran.
const ACCEPTANCE_VALUES = ["PENDING", "HOLD", "ACCEPT", "REJECT"] as const;
const ACCEPTANCE_STYLE: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-500 border-zinc-200",
  HOLD:    "bg-amber-50 text-amber-700 border-amber-200",
  ACCEPT:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECT:  "bg-red-50 text-red-700 border-red-200",
};

const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

// ─── Main ────────────────────────────────────────────────────────────────────

export function InternationalParticipationClient({ event }: { event: { id: string; name: string; slug: string } }) {
  const base = `/api/v2/organizer/events/${event.id}/international`;

  const [countries, setCountries]   = useState<Country[]>([]);
  const [schools, setSchools]       = useState<SchoolRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [countryId, setCountryId]   = useState<string | null>(null);
  const [schoolId, setSchoolId]     = useState<string | null>(null);

  const [countryDialog, setCountryDialog] = useState(false);
  const [schoolDialog, setSchoolDialog]   = useState<{ id?: string; name: string; shortName: string } | null>(null);
  const [deleteSchool, setDeleteSchool]   = useState<SchoolRow | null>(null);

  const loadOverview = useCallback(async () => {
    const r = await api<{ countries: Country[]; contingents: SchoolRow[] }>(base);
    setLoading(false);
    if (!r.ok) { setError(r.message); return; }
    setCountries(r.data.countries);
    setSchools(r.data.contingents);
  }, [base]);

  useEffect(() => { void loadOverview(); }, [loadOverview]); // eslint-disable-line react-hooks/set-state-in-effect

  // Countries with schools first, then the rest (added but still empty).
  const countryRows = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of schools) if (s.countryId) n.set(s.countryId, (n.get(s.countryId) ?? 0) + 1);
    return countries
      .map((c) => ({ ...c, schools: n.get(c.id) ?? 0 }))
      .sort((a, b) => (b.schools > 0 ? 1 : 0) - (a.schools > 0 ? 1 : 0) || a.name.localeCompare(b.name));
  }, [countries, schools]);

  const country = countries.find((c) => c.id === countryId) ?? null;
  const countrySchools = schools.filter((s) => s.countryId === countryId);
  const school = schools.find((s) => s.id === schoolId) ?? null;

  async function addCountry(iso2: string) {
    const r = await api<Country>(`${base}/countries`, "POST", { iso2 });
    if (!r.ok) return r.message;
    setCountryDialog(false);
    await loadOverview();
    setCountryId(r.data.id);
    setSchoolId(null);
    return null;
  }

  async function saveSchool(form: { id?: string; name: string; shortName: string }) {
    const r = form.id
      ? await api(`${base}/contingents/${form.id}`, "PATCH", { name: form.name, shortName: form.shortName })
      : await api<{ id: string }>(`${base}/contingents`, "POST", { name: form.name, shortName: form.shortName, countryId });
    if (!r.ok) return r.message;
    setSchoolDialog(null);
    await loadOverview();
    if (!form.id) setSchoolId((r.data as { id: string }).id);
    return null;
  }

  async function removeSchool() {
    if (!deleteSchool) return;
    const r = await api(`${base}/contingents/${deleteSchool.id}`, "DELETE");
    setDeleteSchool(null);
    if (!r.ok) { setError(r.message); return; }
    if (schoolId === deleteSchool.id) setSchoolId(null);
    await loadOverview();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <Link
          href={`/organizer/events/${event.slug}/manage`}
          className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-sky-600" /> Penyertaan Antarabangsa
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {event.name} · Negara → Sekolah → Peserta &amp; Jurulatih → Pasukan → Daftar ke acara.
            Pasukan yang didaftarkan akan muncul dalam{" "}
            <Link href={`/organizer/events/${event.slug}/manage/preregistration`} className="text-blue-600 hover:underline">
              Pra-Pendaftaran
            </Link>.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="text-xs underline" onClick={() => setError(null)}>Tutup</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuatkan…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_260px_minmax(0,1fr)]">
          {/* 1. Countries */}
          <Panel
            title="1. Negara"
            icon={Globe2}
            action={<Button size="sm" variant="outline" onClick={() => setCountryDialog(true)}><Plus className="h-3.5 w-3.5" /> Tambah</Button>}
          >
            {countryRows.length === 0 && <Empty>Belum ada negara. Tambah negara peserta.</Empty>}
            {countryRows.map((c) => (
              <ListItem
                key={c.id}
                active={c.id === countryId}
                onClick={() => { setCountryId(c.id); setSchoolId(null); }}
                title={<>{flagEmoji(c.codeIso2)} {c.name}</>}
                meta={`${c.schools} sekolah`}
              />
            ))}
          </Panel>

          {/* 2. Schools */}
          <Panel
            title="2. Sekolah"
            icon={School}
            action={country && (
              <Button size="sm" variant="outline" onClick={() => setSchoolDialog({ name: "", shortName: "" })}>
                <Plus className="h-3.5 w-3.5" /> Tambah
              </Button>
            )}
          >
            {!country && <Empty>Pilih negara.</Empty>}
            {country && countrySchools.length === 0 && <Empty>Belum ada sekolah dari {country.name}.</Empty>}
            {countrySchools.map((s) => (
              <ListItem
                key={s.id}
                active={s.id === schoolId}
                onClick={() => setSchoolId(s.id)}
                title={s.name}
                meta={`${s.participants} peserta · ${s.teams} pasukan · ${s.enrolled} didaftar`}
                actions={
                  <>
                    <IconBtn label="Ubah" onClick={() => setSchoolDialog({ id: s.id, name: s.name, shortName: s.shortName ?? "" })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="Padam" onClick={() => setDeleteSchool(s)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </>
                }
              />
            ))}
          </Panel>

          {/* 3. School detail */}
          <div className="min-w-0">
            {school ? (
              <SchoolPanel
                key={school.id}
                base={`${base}/contingents/${school.id}`}
                acceptanceUrl={`/api/v2/organizer/events/${event.id}/preregistration/teams`}
                schoolName={school.name}
                onChanged={loadOverview}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-sm text-zinc-400">
                Pilih sekolah untuk mengurus peserta, jurulatih dan pasukan.
              </div>
            )}
          </div>
        </div>
      )}

      {countryDialog && (
        <CountryDialog
          existing={new Set(countries.map((c) => c.codeIso2))}
          onClose={() => setCountryDialog(false)}
          onPick={addCountry}
        />
      )}
      {schoolDialog && (
        <SchoolDialog
          initial={schoolDialog}
          countryName={country?.name ?? ""}
          onClose={() => setSchoolDialog(null)}
          onSave={saveSchool}
        />
      )}
      <ConfirmDialog
        open={!!deleteSchool}
        onOpenChange={(o) => { if (!o) setDeleteSchool(null); }}
        title="Padam sekolah?"
        description={`"${deleteSchool?.name}" akan dipadam. Hanya sekolah tanpa peserta, jurulatih dan pasukan boleh dipadam.`}
        confirmLabel="Padam"
        onConfirm={removeSchool}
      />
    </div>
  );
}

// ─── School panel (tabs) ─────────────────────────────────────────────────────

type Tab = "participants" | "trainers" | "teams";

function SchoolPanel({
  base, acceptanceUrl, schoolName, onChanged,
}: {
  base: string;
  /** Pra-Pendaftaran's teams endpoint — its PATCH { teamId, acceptance } is the one place acceptance is set. */
  acceptanceUrl: string;
  schoolName: string;
  onChanged: () => void;
}) {
  const [tab, setTab]         = useState<Tab>("participants");
  const [detail, setDetail]   = useState<SchoolDetail | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState<string | null>(null);

  const [participantForm, setParticipantForm] = useState<Partial<Participant> | null>(null);
  const [trainerForm, setTrainerForm]         = useState<Partial<Trainer> | null>(null);
  const [teamForm, setTeamForm]               = useState<Partial<Team> | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    const r = await api<SchoolDetail>(base);
    if (!r.ok) { setError(r.message); return; }
    setDetail(r.data);
  }, [base]);

  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function refresh() { await load(); onChanged(); }

  async function run(key: string, url: string, method: string) {
    setBusy(key);
    const r = await api(url, method);
    setBusy(null);
    if (!r.ok) { setError(r.message); return; }
    await refresh();
  }

  // Optimistic, reverted on failure — as Pra-Pendaftaran does it.
  async function updateAcceptance(teamId: string, acceptance: string) {
    const setEntry = (value: string) => setDetail((d) => d && {
      ...d,
      teams: d.teams.map((t) => (t.id === teamId && t.entry ? { ...t, entry: { ...t.entry, acceptance: value } } : t)),
    });
    const old = detail?.teams.find((t) => t.id === teamId)?.entry?.acceptance ?? "PENDING";
    setEntry(acceptance);
    const r = await api(acceptanceUrl, "PATCH", { teamId, acceptance });
    if (!r.ok) { setEntry(old); setError(r.message); }
  }

  if (!detail)
    return <div className="flex items-center gap-2 text-sm text-zinc-500 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Memuatkan…</div>;

  const compById = new Map(detail.competitions.map((c) => [c.id, c]));
  const tabs: { key: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: "participants", label: "Peserta",               icon: Users,   count: detail.participants.length },
    { key: "trainers",     label: "Jurulatih / Pengurus",  icon: UserCog, count: detail.trainers.length },
    { key: "teams",        label: "Pasukan & Penyertaan",  icon: Trophy,  count: detail.teams.length },
  ];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="px-4 pt-4">
        <h2 className="font-semibold text-zinc-900">{schoolName}</h2>
        <div className="mt-3 flex gap-1 border-b border-zinc-100 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.key ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
              <span className="text-[10px] rounded-full bg-zinc-100 px-1.5 text-zinc-500">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="text-xs underline" onClick={() => setError(null)}>Tutup</button>
        </div>
      )}

      <div className="p-4">
        {tab === "participants" && (
          <>
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setParticipantForm({})}><Plus className="h-3.5 w-3.5" /> Tambah peserta</Button>
            </div>
            <Table
              head={["Nama", "Pasport", "Tarikh lahir / umur", "Jantina", "Tahap / darjah", "Pasukan", ""]}
              empty="Belum ada peserta."
              rows={detail.participants.map((p) => [
                <span key="n" className="font-medium text-zinc-800">{p.name}</span>,
                p.passport ?? "—",
                `${p.birthDate ?? "—"}${p.age != null ? ` (${p.age})` : ""}`,
                p.gender === "MALE" ? "Lelaki" : "Perempuan",
                `${EDU_LABEL[p.eduLevel] ?? p.eduLevel}${p.classGrade ? ` · ${p.classGrade}` : ""}`,
                p.teamCount,
                <RowActions
                  key="a"
                  onEdit={() => setParticipantForm(p)}
                  onDelete={() => setConfirm({
                    title: "Padam peserta?",
                    description: `${p.name} akan dipadam.`,
                    run: () => run(`p-${p.id}`, `${base}/participants/${p.id}`, "DELETE"),
                  })}
                />,
              ])}
            />
          </>
        )}

        {tab === "trainers" && (
          <>
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setTrainerForm({})}><Plus className="h-3.5 w-3.5" /> Tambah jurulatih</Button>
            </div>
            <Table
              head={["Nama", "Pasport", "E-mel", "Telefon", ""]}
              empty="Belum ada jurulatih / pengurus."
              rows={detail.trainers.map((t) => [
                <span key="n" className="font-medium text-zinc-800">{t.name}</span>,
                t.passport ?? "—",
                t.email ?? "—",
                t.phoneNumber ?? "—",
                <RowActions
                  key="a"
                  onEdit={() => setTrainerForm(t)}
                  onDelete={() => setConfirm({
                    title: "Padam jurulatih?",
                    description: `${t.name} akan dipadam dan dikeluarkan daripada pasukannya.`,
                    run: () => run(`t-${t.id}`, `${base}/trainers/${t.id}`, "DELETE"),
                  })}
                />,
              ])}
            />
          </>
        )}

        {tab === "teams" && (
          <>
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setTeamForm({})} disabled={detail.competitions.length === 0}>
                <Plus className="h-3.5 w-3.5" /> Daftar pasukan
              </Button>
            </div>
            {detail.competitions.length === 0 && <Empty>Acara ini belum mempunyai pertandingan.</Empty>}
            <Table
              head={["Pertandingan", "Pasukan", "Ahli", "Jurulatih", "Penyertaan acara", ""]}
              empty="Belum ada pasukan."
              rows={detail.teams.map((t) => {
                const comp = compById.get(t.competitionId);
                return [
                  <span key="c" className="text-xs"><span className="font-mono text-zinc-500">{comp?.code}</span> {comp?.name}</span>,
                  <span key="n" className="font-medium text-zinc-800">{t.name}</span>,
                  t.members.map((m) => m.name).join(", ") || "—",
                  t.trainers.map((m) => m.name).join(", ") || "—",
                  <div key="e" className="flex items-center gap-2">
                    {t.entry ? (
                      <>
                        <select
                          aria-label="Status penyertaan"
                          value={t.entry.acceptance}
                          onChange={(e) => updateAcceptance(t.id, e.target.value)}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer appearance-none text-center ${ACCEPTANCE_STYLE[t.entry.acceptance] ?? ACCEPTANCE_STYLE.PENDING}`}
                        >
                          {ACCEPTANCE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                        {t.entry.selected && <span className="text-[11px] text-zinc-400">dipilih</span>}
                      </>
                    ) : (
                      <span className="text-[11px] text-zinc-400">Belum didaftar</span>
                    )}
                    {t.entry ? (
                      !t.entry.selected && (
                        <button
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          disabled={busy === `e-${t.id}`}
                          onClick={() => run(`e-${t.id}`, `${base}/teams/${t.id}/enroll`, "DELETE")}
                        >
                          Tarik balik
                        </button>
                      )
                    ) : (
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs"
                        disabled={busy === `e-${t.id}`}
                        onClick={() => run(`e-${t.id}`, `${base}/teams/${t.id}/enroll`, "POST")}
                      >
                        {busy === `e-${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Daftar ke acara
                      </Button>
                    )}
                  </div>,
                  t.locked ? (
                    <span key="l" title="Dipilih dalam Pra-Pendaftaran — dikunci" className="text-zinc-400"><Lock className="h-3.5 w-3.5" /></span>
                  ) : (
                    <RowActions
                      key="a"
                      onEdit={() => setTeamForm(t)}
                      onDelete={() => setConfirm({
                        title: "Padam pasukan?",
                        description: `${t.name} akan dipadam (termasuk penyertaannya dalam acara ini).`,
                        run: () => run(`d-${t.id}`, `${base}/teams/${t.id}`, "DELETE"),
                      })}
                    />
                  ),
                ];
              })}
            />
          </>
        )}
      </div>

      {participantForm && (
        <ParticipantDialog
          initial={participantForm}
          onClose={() => setParticipantForm(null)}
          onSave={async (body) => {
            const r = participantForm.id
              ? await api(`${base}/participants/${participantForm.id}`, "PATCH", body)
              : await api(`${base}/participants`, "POST", body);
            if (!r.ok) return r.message;
            setParticipantForm(null);
            await refresh();
            return null;
          }}
        />
      )}
      {trainerForm && (
        <TrainerDialog
          initial={trainerForm}
          onClose={() => setTrainerForm(null)}
          onSave={async (body) => {
            const r = trainerForm.id
              ? await api(`${base}/trainers/${trainerForm.id}`, "PATCH", body)
              : await api(`${base}/trainers`, "POST", body);
            if (!r.ok) return r.message;
            setTrainerForm(null);
            await refresh();
            return null;
          }}
        />
      )}
      {teamForm && (
        <TeamDialog
          initial={teamForm}
          detail={detail}
          onClose={() => setTeamForm(null)}
          onSave={async (body) => {
            const r = teamForm.id
              ? await api(`${base}/teams/${teamForm.id}`, "PATCH", body)
              : await api(`${base}/teams`, "POST", body);
            if (!r.ok) return r.message;
            setTeamForm(null);
            await refresh();
            return null;
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel="Padam"
        onConfirm={async () => { const c = confirm; setConfirm(null); await c?.run(); }}
      />
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

type SaveFn<T> = (body: T) => Promise<string | null>;

function FormDialog({
  title, onClose, onSubmit, children, wide,
}: { title: string; onClose: () => void; onSubmit: () => Promise<string | null>; children: React.ReactNode; wide?: boolean }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className={wide ? "max-w-2xl" : "max-w-lg"}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError(await onSubmit());
            setSaving(false);
          }}
        >
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <div className="px-6 pt-4 space-y-3 max-h-[65vh] overflow-y-auto">
            {children}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function CountryDialog({
  existing, onClose, onPick,
}: { existing: Set<string>; onClose: () => void; onPick: (iso2: string) => Promise<string | null> }) {
  const [q, setQ]           = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const list = ISO_COUNTRIES.filter(([iso2, , name]) =>
    iso2 !== "MY" && !existing.has(iso2) && (!q || name.toLowerCase().includes(q.toLowerCase()) || iso2 === q.toUpperCase()));
  return (
    <FormDialog
      title="Tambah negara"
      onClose={onClose}
      onSubmit={async () => (picked ? onPick(picked) : "Pilih negara.")}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input autoFocus className="pl-9" placeholder="Cari negara…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-100 divide-y divide-zinc-50">
        {list.map(([iso2, , name]) => (
          <button
            type="button"
            key={iso2}
            onClick={() => setPicked(iso2)}
            className={`w-full text-left px-3 py-2 text-sm ${picked === iso2 ? "bg-blue-50 text-blue-700" : "hover:bg-zinc-50"}`}
          >
            {flagEmoji(iso2)} {name} <span className="text-xs text-zinc-400">{iso2}</span>
          </button>
        ))}
        {list.length === 0 && <p className="p-3 text-sm text-zinc-400">Tiada padanan.</p>}
      </div>
    </FormDialog>
  );
}

function SchoolDialog({
  initial, countryName, onClose, onSave,
}: {
  initial: { id?: string; name: string; shortName: string };
  countryName: string;
  onClose: () => void;
  onSave: SaveFn<{ id?: string; name: string; shortName: string }>;
}) {
  const [form, setForm] = useState(initial);
  return (
    <FormDialog title={initial.id ? "Ubah sekolah" : `Tambah sekolah — ${countryName}`} onClose={onClose} onSubmit={() => onSave(form)}>
      <Field label="Nama sekolah">
        <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Nama ringkas (pilihan)">
        <Input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
      </Field>
    </FormDialog>
  );
}

function ParticipantDialog({
  initial, onClose, onSave,
}: { initial: Partial<Participant>; onClose: () => void; onSave: SaveFn<Record<string, unknown>> }) {
  const [form, setForm] = useState({
    name:        initial.name ?? "",
    passport:    initial.passport ?? "",
    birthDate:   initial.birthDate ?? "",
    gender:      initial.gender ?? "",
    eduLevel:    initial.eduLevel ?? "",
    classGrade:  initial.classGrade ?? "",
    email:       initial.email ?? "",
    phoneNumber: initial.phoneNumber ?? "",
    ppki:        initial.ppki ?? false,
  });
  const age = form.birthDate && !Number.isNaN(new Date(form.birthDate).getTime())
    ? ageFromBirthDate(new Date(form.birthDate))
    : null;

  // The birth date stands in for the IC: it fills level and grade the same way
  // the IC does for local participants. Both stay editable.
  function setBirthDate(v: string) {
    const d = new Date(v);
    if (!v || Number.isNaN(d.getTime())) { setForm({ ...form, birthDate: v }); return; }
    const a = ageFromBirthDate(d);
    setForm({ ...form, birthDate: v, eduLevel: eduLevelForAge(a), classGrade: gradeForAge(a) ?? "" });
  }

  return (
    <FormDialog title={initial.id ? "Ubah peserta" : "Tambah peserta"} onClose={onClose} onSubmit={() => onSave(form)} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama penuh">
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="No. pasport">
          <Input value={form.passport} onChange={(e) => setForm({ ...form, passport: e.target.value })} />
        </Field>
        <Field label="Tarikh lahir" hint={age != null ? `Umur ${age} (mengikut tahun kalendar, seperti IC)` : undefined}>
          <Input type="date" value={form.birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </Field>
        <Field label="Jantina">
          <select className={selectCls} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as "MALE" | "FEMALE" })}>
            <option value="">— Pilih —</option>
            <option value="MALE">Lelaki</option>
            <option value="FEMALE">Perempuan</option>
          </select>
        </Field>
        <Field label="Tahap pendidikan">
          <select className={selectCls} value={form.eduLevel} onChange={(e) => setForm({ ...form, eduLevel: e.target.value })}>
            <option value="">— Pilih —</option>
            {Object.entries(EDU_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Darjah / tingkatan setara" hint="Cth. Darjah 5, Tingkatan 2 — digunakan untuk kelayakan kumpulan sasaran.">
          <Input value={form.classGrade} onChange={(e) => setForm({ ...form, classGrade: e.target.value })} />
        </Field>
        <Field label="E-mel (pilihan)">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Telefon (pilihan)">
          <Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={form.ppki} onChange={(e) => setForm({ ...form, ppki: e.target.checked })} />
        Keperluan pendidikan khas (PPKI)
      </label>
    </FormDialog>
  );
}

function TrainerDialog({
  initial, onClose, onSave,
}: { initial: Partial<Trainer>; onClose: () => void; onSave: SaveFn<Record<string, unknown>> }) {
  const [form, setForm] = useState({
    name: initial.name ?? "", passport: initial.passport ?? "", email: initial.email ?? "", phoneNumber: initial.phoneNumber ?? "",
  });
  return (
    <FormDialog title={initial.id ? "Ubah jurulatih" : "Tambah jurulatih / pengurus"} onClose={onClose} onSubmit={() => onSave(form)}>
      <Field label="Nama penuh"><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="No. pasport (pilihan)"><Input value={form.passport} onChange={(e) => setForm({ ...form, passport: e.target.value })} /></Field>
      <Field label="E-mel (pilihan)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Telefon (pilihan)"><Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} /></Field>
    </FormDialog>
  );
}

function TeamDialog({
  initial, detail, onClose, onSave,
}: { initial: Partial<Team>; detail: SchoolDetail; onClose: () => void; onSave: SaveFn<Record<string, unknown>> }) {
  const editing = !!initial.id;
  const [competitionId, setCompetitionId] = useState(initial.competitionId ?? "");
  const [name, setName]                   = useState(initial.name ?? "");
  const [memberIds, setMemberIds]         = useState<string[]>(initial.members?.map((m) => m.id) ?? []);
  const [trainerIds, setTrainerIds]       = useState<string[]>(initial.trainers?.map((t) => t.id) ?? []);
  const [enroll, setEnroll]               = useState(true);

  const comp = detail.competitions.find((c) => c.id === competitionId) ?? null;
  const individual = comp?.participationType === "INDIVIDUAL";
  const max = individual ? 1 : Math.max(1, comp?.maxTeamSize ?? 1);
  const eligible = new Set(comp?.eligibleParticipantIds ?? []);
  const candidates = detail.participants.filter((p) => eligible.has(p.id) || memberIds.includes(p.id));

  function toggleMember(id: string) {
    if (individual) { setMemberIds([id]); return; }
    setMemberIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= max ? cur : [...cur, id]);
  }

  return (
    <FormDialog
      title={editing ? "Ubah pasukan" : "Daftar pasukan"}
      onClose={onClose}
      wide
      onSubmit={async () => {
        if (!comp) return "Pilih pertandingan.";
        return onSave({ competitionId, name, memberIds, trainerIds, ...(editing ? {} : { enroll }) });
      }}
    >
      <Field label="Pertandingan">
        <select
          className={selectCls}
          value={competitionId}
          disabled={editing}
          onChange={(e) => { setCompetitionId(e.target.value); setMemberIds([]); }}
        >
          <option value="">— Pilih —</option>
          {detail.competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.name} ({c.participationType === "INDIVIDUAL" ? "individu" : `pasukan ${c.minTeamSize}–${c.maxTeamSize}`})
            </option>
          ))}
        </select>
      </Field>

      {comp && !individual && (
        <Field label="Nama pasukan">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}

      {comp && (
        <Field
          label={individual ? "Peserta" : `Ahli pasukan (${memberIds.length}/${max})`}
          hint="Hanya peserta yang layak mengikut kumpulan sasaran pertandingan ini disenaraikan."
        >
          <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-100 divide-y divide-zinc-50">
            {candidates.length === 0 && <p className="p-3 text-sm text-zinc-400">Tiada peserta yang layak.</p>}
            {candidates.map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
                <input
                  type={individual ? "radio" : "checkbox"}
                  name="member"
                  checked={memberIds.includes(p.id)}
                  onChange={() => toggleMember(p.id)}
                />
                <span className="flex-1">{p.name}</span>
                <span className="text-xs text-zinc-400">{p.classGrade ?? EDU_LABEL[p.eduLevel]}{p.age != null ? ` · ${p.age} thn` : ""}</span>
              </label>
            ))}
          </div>
        </Field>
      )}

      {comp && (
        <Field label="Jurulatih (pilihan)">
          <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-100 divide-y divide-zinc-50">
            {detail.trainers.length === 0 && <p className="p-3 text-sm text-zinc-400">Belum ada jurulatih untuk sekolah ini.</p>}
            {detail.trainers.map((t) => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trainerIds.includes(t.id)}
                  onChange={() => setTrainerIds((cur) => cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id])}
                />
                {t.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      {comp && !editing && (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={enroll} onChange={(e) => setEnroll(e.target.checked)} />
          Daftar terus ke acara ini (masuk ke Pra-Pendaftaran)
        </label>
      )}
    </FormDialog>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Panel({
  title, icon: Icon, action, children,
}: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-zinc-100">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-700"><Icon className="h-4 w-4 text-zinc-400" /> {title}</span>
        {action}
      </div>
      <div className="p-1.5 space-y-0.5 max-h-[70vh] overflow-y-auto">{children}</div>
    </div>
  );
}

function ListItem({
  active, onClick, title, meta, actions,
}: { active: boolean; onClick: () => void; title: React.ReactNode; meta?: string; actions?: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer ${active ? "bg-blue-50" : "hover:bg-zinc-50"}`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${active ? "text-blue-700 font-medium" : "text-zinc-800"}`}>{title}</p>
        {meta && <p className="text-[11px] text-zinc-400">{meta}</p>}
      </div>
      {actions && <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
      {children}
    </button>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-0.5">
      <IconBtn label="Ubah" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></IconBtn>
      <IconBtn label="Padam" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 py-3 text-xs text-zinc-400">{children}</p>;
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
            {head.map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => <td key={j} className="px-2 py-2 text-zinc-600">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
