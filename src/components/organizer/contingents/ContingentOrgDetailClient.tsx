"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Users, UserCheck, Trophy,
  Search, Pencil, ChevronLeft, ChevronRight,
  School as SchoolIcon, Building2, MapPin, Loader2, X, Check, Trash2, AlertTriangle,
  ChevronDown, Plus, Upload, Sparkles, Download,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Types ───────────────────────────────────────────────────────────────────

type ZoneRef    = { id: string; name: string };
type ZoneState  = { zone: ZoneRef };
type StateRef   = { id: string; name: string; code: string; zoneStates?: ZoneState[] };

type SchoolDetail = {
  id: string; name: string; code: string;
  level: string; category: string; categoryShort: string | null; ppdCode: string | null;
  zone: ZoneRef | null;
  district: { id: string; name: string } | null;
  state: StateRef | null;
};

type HIDetail = {
  id: string; name: string; code: string | null;
  heiType: string; sector: string | null;
  state: StateRef | null;
};

type ContingentDetail = {
  id: string;
  name: string;
  shortName: string | null;
  contingentType: "SCHOOL" | "HIGHER" | "INDEPENDENT" | "INTERNATIONAL";
  locality: string | null;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
  state: StateRef | null;
  zone: ZoneRef | null;
  school: SchoolDetail | null;
  higherInstitution: HIDetail | null;
  stateName: string | null;
  stateCode: string | null;
  zoneName: string | null;
  managers: ManagerMember[];
  teams: TeamRow[];
  _count: { participants: number };
};

type ManagerMember = {
  id: string; role: string; status: string; createdAt: string;
  manager: { id: string; name: string; email: string; phone: string | null };
};

type TeamRow = {
  id: string; name: string; status: string;
  competition: { id: string; code: string; name: string; participationType: string } | null;
  _count: { members: number; teamEvents: number };
};

type Participant = {
  id: string; name: string; ic: string | null; email: string | null;
  phoneNumber: string | null; gender: string; age: number | null;
  eduLevel: string; classGrade: string | null; className: string | null;
  status: string; ppki: boolean; createdAt: string;
};

type ParticipantsPage = { total: number; page: number; pageSize: number; data: Participant[] };

type TrainerTeam = {
  team: { id: string; name: string; competition: { code: string; name: string } | null } | null;
};

type TrainerRow = {
  id: string; name: string; ic: string | null; email: string | null;
  phoneNumber: string | null; status: string; createdAt: string;
  teams: TrainerTeam[];
};

type SchoolResult = { id: string; name: string; code: string; level: string; state: { name: string } };
type HIResult     = { id: string; name: string; code: string | null; state: { name: string } | null };

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ["Details", "Managers", "Trainers", "Teams", "Participants"] as const;
type Tab = typeof TABS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  SCHOOL: "School", HIGHER: "Higher Ed",
  INDEPENDENT: "Independent", INTERNATIONAL: "International",
};
const TYPE_COLOR: Record<string, string> = {
  SCHOOL:        "bg-blue-50 text-blue-700 border-blue-200",
  HIGHER:        "bg-purple-50 text-purple-700 border-purple-200",
  INDEPENDENT:   "bg-amber-50 text-amber-700 border-amber-200",
  INTERNATIONAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const EDU_OPTIONS: { value: string; label: string }[] = [
  { value: "KINDERGARTEN", label: "Kindergarten" },
  { value: "PRIMARY",      label: "Primary School" },
  { value: "SECONDARY",    label: "Secondary School" },
  { value: "YOUTH",        label: "Youth / Belia" },
];

function Dl({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-800">{value ?? <span className="text-zinc-300">—</span>}</dd>
    </div>
  );
}

// ─── School search dialog ─────────────────────────────────────────────────────

function SchoolPickerDialog({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (s: SchoolResult) => void }) {
  const [q, setQ]           = useState("");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/v2/reference/schools?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json();
      setResults(json.data ?? []);
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Search School</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 px-6 pt-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Type school name or code…" />
          <Button onClick={search} disabled={loading || !q.trim()} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-1">
          {results.length === 0 && !loading && (
            <p className="text-sm text-zinc-400 text-center py-8">Search to find schools.</p>
          )}
          {results.map((s) => (
            <button key={s.id} type="button" onClick={() => { onPick(s); onClose(); }}
              className="w-full text-left p-3 rounded-lg border hover:bg-zinc-50 transition-colors flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                <SchoolIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium leading-tight">{s.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {s.code} · {s.state.name} · <span className="capitalize">{s.level.toLowerCase()}</span>
                </p>
              </div>
            </button>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── HEI search dialog ────────────────────────────────────────────────────────

function HIPickerDialog({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (h: HIResult) => void }) {
  const [q, setQ]           = useState("");
  const [results, setResults] = useState<HIResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/v2/reference/higher-institutions?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json();
      setResults(json.data ?? []);
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Search Higher Institution</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 px-6 pt-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Type institution name or code…" />
          <Button onClick={search} disabled={loading || !q.trim()} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-1">
          {results.length === 0 && !loading && (
            <p className="text-sm text-zinc-400 text-center py-8">Search to find institutions.</p>
          )}
          {results.map((h) => (
            <button key={h.id} type="button" onClick={() => { onPick(h); onClose(); }}
              className="w-full text-left p-3 rounded-lg border hover:bg-zinc-50 transition-colors flex items-start gap-3">
              <div className="h-8 w-8 flex items-center justify-center rounded-full bg-violet-50 text-violet-600 shrink-0 mt-0.5">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium leading-tight">{h.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {[h.code, h.state?.name].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Change-confirmation dialog ───────────────────────────────────────────────

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

type PendingChange = {
  label: string;
  body: Record<string, unknown>;
};

function ConfirmChangeDialog({
  pending, onConfirm, onCancel,
}: {
  pending: PendingChange | null;
  onConfirm: (body: Record<string, unknown>, note: string) => void;
  onCancel: () => void;
}) {
  const [code]       = useState(genCode);
  const [typed, setTyped]   = useState("");
  const [note,  setNote]    = useState("");

  const match = typed.toUpperCase() === code;

  if (!pending) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Change</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4 space-y-4 text-sm">
          {pending.label.split("\n\n").map((line, i) => (
            <p key={i} className={i === 0 ? "text-zinc-600" : "text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs mt-1"}>{line}</p>
          ))}

          <div className="rounded-lg border bg-zinc-50 p-3 space-y-1">
            <p className="text-xs text-zinc-500">Type the code below to confirm:</p>
            <p className="text-xl font-bold tracking-[0.3em] text-zinc-900 select-none text-center py-1">
              {code}
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())}
              placeholder="Enter code…"
              maxLength={5}
              className={`text-center tracking-[0.25em] font-mono uppercase text-base mt-1 transition-colors ${
                typed.length === 5
                  ? match ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
                  : ""
              }`}
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-500">Note (optional)</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for this change…"
              rows={2}
              className="mt-1 block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(pending.body, note)} disabled={!match}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Institution card with edit ───────────────────────────────────────────────

function InstitutionCard({
  contingentId,
  contingentType,
  school,
  hi,
  onUpdated,
}: {
  contingentId: string;
  contingentType: ContingentDetail["contingentType"];
  school: SchoolDetail | null;
  hi: HIDetail | null;
  onUpdated: (patch: { school: SchoolDetail | null; higherInstitution: HIDetail | null; name?: string }) => void;
}) {
  const [schoolPicker, setSchoolPicker] = useState(false);
  const [hiPicker,     setHiPicker]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [pending,      setPending]      = useState<PendingChange | null>(null);

  async function applyPatch(body: Record<string, unknown>, note?: string) {
    setSaving(true);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, note: note || undefined }),
      });
      const json = await res.json();
      if (res.ok) onUpdated({ school: json.school ?? null, higherInstitution: json.higherInstitution ?? null, name: json.name });
    } finally { setSaving(false); }
  }

  function requestChange(label: string, body: Record<string, unknown>) {
    setPending({ label, body });
  }

  function handleConfirm(body: Record<string, unknown>, note: string) {
    setPending(null);
    applyPatch(body, note);
  }

  const mapQuery = school
    ? encodeURIComponent(`${school.name}, ${school.state?.name ?? ""}, Malaysia`)
    : null;
  const mapSrc = mapQuery
    ? `https://maps.google.com/maps?q=${mapQuery}&output=embed&z=15`
    : null;

  const hasInstitution = school || hi;

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-zinc-50">
        <h3 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
          {school ? <SchoolIcon className="h-4 w-4 text-blue-500" /> : <Building2 className="h-4 w-4 text-violet-500" />}
          {school ? "School" : hi ? "Higher Institution" : "Institution"}
        </h3>
        <div className="flex items-center gap-2">
          {hasInstitution && (
            <button
              onClick={() => requestChange(
                `Remove the current ${school ? "school" : "institution"} assignment from this contingent.`,
                { clearInstitution: true }
              )}
              disabled={saving}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors flex items-center gap-1 disabled:opacity-40">
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          )}
          {(contingentType === "SCHOOL" || contingentType === "INDEPENDENT" || !school) && (
            <button onClick={() => setSchoolPicker(true)} disabled={saving}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 disabled:opacity-40">
              <SchoolIcon className="h-3.5 w-3.5" /> {school ? "Change School" : "Assign School"}
            </button>
          )}
          {(contingentType === "HIGHER" || contingentType === "INDEPENDENT" || !hi) && (
            <button onClick={() => setHiPicker(true)} disabled={saving}
              className="text-xs text-violet-600 hover:text-violet-800 transition-colors flex items-center gap-1 disabled:opacity-40">
              <Building2 className="h-3.5 w-3.5" /> {hi ? "Change HEI" : "Assign HEI"}
            </button>
          )}
          {saving && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </div>
      </div>

      {/* Institution details */}
      {!hasInstitution ? (
        <p className="px-5 py-8 text-sm text-zinc-400 text-center">No institution assigned.</p>
      ) : school ? (
        <div className="divide-y">
          {/* Info grid */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 p-5">
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-zinc-400 font-medium uppercase tracking-wide">School Name</dt>
              <dd className="mt-0.5 text-sm font-semibold text-zinc-900">{school.name}</dd>
            </div>
            <Dl label="Code" value={school.code} />
            <Dl label="Pejabat Pendidikan" value={school.ppdCode} />
            <Dl label="Level" value={<span className="capitalize">{school.level?.toLowerCase()}</span>} />
            <Dl label="Category" value={school.categoryShort ?? school.category?.replace(/_/g, " ")} />
            <Dl label="State" value={school.state?.name} />
          </dl>

          {/* Map */}
          {mapSrc && (
            <div className="w-full h-56 bg-zinc-100 relative">
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs text-zinc-600 shadow-sm border">
                <MapPin className="h-3 w-3 text-red-500" /> {school.name}
              </div>
              <iframe
                title="School location"
                src={mapSrc}
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>
      ) : hi ? (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 p-5">
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Institution Name</dt>
            <dd className="mt-0.5 text-sm font-semibold text-zinc-900">{hi.name}</dd>
          </div>
          <Dl label="Code" value={hi.code} />
          <Dl label="Type" value={hi.heiType} />
          <Dl label="Sector" value={hi.sector} />
          <Dl label="State" value={hi.state?.name} />
        </dl>
      ) : null}

      <SchoolPickerDialog open={schoolPicker} onClose={() => setSchoolPicker(false)}
        onPick={(s) => {
          setSchoolPicker(false);
          requestChange(
            `Assign school "${s.name}" (${s.code}) to this contingent.\n\nThe contingent name will also be updated to "${s.name}".`,
            { schoolId: s.id, name: s.name }
          );
        }} />
      <HIPickerDialog open={hiPicker} onClose={() => setHiPicker(false)}
        onPick={(h) => {
          setHiPicker(false);
          requestChange(
            `Assign higher institution "${h.name}" to this contingent.\n\nThe contingent name will also be updated to "${h.name}".`,
            { higherInstitutionId: h.id, name: h.name }
          );
        }} />

      <ConfirmChangeDialog
        pending={pending}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

// ─── Remove manager dialog ────────────────────────────────────────────────────

function RemoveManagerDialog({
  open, member, contingentId, onClose, onRemoved,
}: {
  open: boolean;
  member: ManagerMember | null;
  contingentId: string;
  onClose: () => void;
  onRemoved: (managers: ManagerMember[]) => void;
}) {
  const [code,     setCodeState] = useState(() => genCode());
  const [input,    setInput]     = useState("");
  const [note,     setNote]      = useState("");
  const [removing, setRemoving]  = useState(false);
  const [error,    setError]     = useState("");

  // Reset on each open via key (see usage below)

  async function handleRemove() {
    if (!member || input !== code) return;
    setRemoving(true); setError("");
    try {
      const res = await fetch(
        `/api/v2/organizer/contingents/${contingentId}/managers/${member.id}`,
        { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) },
      );
      const text = await res.text();
      let j: { error?: string; managers?: ManagerMember[] } = {};
      try { j = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok) throw new Error(j.error ?? "Remove failed");
      onRemoved(j.managers ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Remove failed");
      setRemoving(false);
    }
  }

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !removing) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" /> Remove Manager
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p>This will remove <span className="font-semibold">{member.manager.name}</span> from this contingent. Their participant and team data will remain.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Note (optional)</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for removal…"
              disabled={removing}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Type the confirmation code to enable remove:</p>
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-center">
              <p className="text-2xl font-mono font-bold tracking-[0.35em] text-red-600 select-all">{code}</p>
            </div>
            <input
              type="text"
              autoComplete="off"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono tracking-[0.3em] text-center uppercase focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder={code.split("").map(() => "_").join(" ")}
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 5))}
              disabled={removing}
              onKeyDown={(e) => { if (e.key === "Enter" && input === code) handleRemove(); }}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={removing}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={input !== code || removing}
            onClick={handleRemove}
            className="gap-1.5"
          >
            {removing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Removing…</>
              : <><Trash2 className="h-4 w-4" /> Remove Manager</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Managers Tab ────────────────────────────────────────────────────────────

const MANAGER_STATUSES = ["ACTIVE", "PENDING", "REJECTED"] as const;

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   "text-green-700 border-green-300 bg-green-50",
  PENDING:  "text-amber-700 border-amber-300 bg-amber-50",
  REJECTED: "text-red-700 border-red-300 bg-red-50",
};

const statusLabel = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase();

/** Inline dropdown letting an organizer change a manager's status. */
function ManagerStatusChanger({
  contingentId,
  member,
  onUpdated,
}: {
  contingentId: string;
  member: ManagerMember;
  onUpdated: (m: ManagerMember[]) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function change(status: string) {
    setOpen(false);
    if (status === member.status) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v2/organizer/contingents/${contingentId}/managers/${member.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const json = await res.json();
      if (res.ok) onUpdated(json.managers ?? []);
    } finally {
      setSaving(false);
    }
  }

  const badgeClass = STATUS_BADGE[member.status] ?? "text-zinc-500";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        title="Change status"
        className="disabled:opacity-40"
      >
        <Badge variant="outline" className={`text-xs gap-1 cursor-pointer ${badgeClass}`}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : statusLabel(member.status)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Badge>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-32 rounded-md border bg-white py-1 shadow-lg">
          {MANAGER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => change(s)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-zinc-50 ${
                s === member.status ? "font-semibold text-zinc-900" : "text-zinc-600"
              }`}
            >
              {statusLabel(s)}
              {s === member.status && <Check className="h-3.5 w-3.5 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagersTab({
  contingentId,
  managers,
  onManagersUpdated,
}: {
  contingentId: string;
  managers: ManagerMember[];
  onManagersUpdated: (m: ManagerMember[]) => void;
}) {
  const [pendingTransfer, setPendingTransfer] = useState<PendingChange | null>(null);
  const [saving,         setSaving]          = useState(false);
  const [removeTarget,   setRemoveTarget]    = useState<ManagerMember | null>(null);
  const [removeKey,      setRemoveKey]       = useState(0);

  const coManagers = managers.filter((m) => m.role !== "OWNER");

  async function applyTransfer(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/managers/transfer-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) onManagersUpdated(json.managers ?? managers);
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {managers.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-400">No managers registered.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Email</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Phone</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Role</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Status</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Joined</th>
              <th className="px-4 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {managers.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-900">{m.manager.name}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{m.manager.email}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{m.manager.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  {m.role === "OWNER"
                    ? <Badge variant="outline" className="text-xs text-indigo-700 border-indigo-200 bg-indigo-50">Primary Manager</Badge>
                    : <Badge variant="outline" className="text-xs text-blue-700 border-blue-200 bg-blue-50">Co-Manager</Badge>}
                </td>
                <td className="px-4 py-3">
                  <ManagerStatusChanger
                    contingentId={contingentId}
                    member={m}
                    onUpdated={onManagersUpdated}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">{new Date(m.createdAt).toLocaleDateString("en-MY")}</td>
                <td className="px-4 py-3">
                  {m.role !== "OWNER" && (
                    <div className="flex items-center gap-1.5">
                      {coManagers.length > 0 && (
                        <button
                          onClick={() => setPendingTransfer({
                            label: `Transfer Primary Manager role to "${m.manager.name}".\n\nThe roles will be swapped — the current Primary Manager becomes a Co-Manager.`,
                            body: { newOwnerId: m.id },
                          })}
                          disabled={saving}
                          title="Make Primary Manager"
                          className="text-zinc-300 hover:text-indigo-600 transition-colors disabled:opacity-40"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setRemoveTarget(m); setRemoveKey((k) => k + 1); }}
                        disabled={saving}
                        title="Remove manager"
                        className="text-zinc-300 hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {managers.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 border-t bg-zinc-50 text-xs text-zinc-500">
          <span className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-zinc-200 text-zinc-500 flex items-center justify-center font-semibold text-[10px]">i</span>
          <span>
            To change the <span className="font-medium text-zinc-700">Primary Manager</span>, click the{" "}
            <Check className="inline h-3.5 w-3.5 text-indigo-500 align-text-bottom" />{" "}
            icon on any <span className="font-medium text-zinc-700">Co-Manager</span> row to swap roles — they become the Primary Manager and the current one becomes a Co-Manager.
          </span>
        </div>
      )}

      {pendingTransfer && (
        <ConfirmChangeDialog
          pending={pendingTransfer}
          onConfirm={(body) => { setPendingTransfer(null); applyTransfer(body); }}
          onCancel={() => setPendingTransfer(null)}
        />
      )}
      {saving && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-zinc-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </div>
      )}

      <RemoveManagerDialog
        key={removeKey}
        open={!!removeTarget}
        member={removeTarget}
        contingentId={contingentId}
        onClose={() => setRemoveTarget(null)}
        onRemoved={(updated) => { setRemoveTarget(null); onManagersUpdated(updated); }}
      />
    </div>
  );
}

// ─── Teams Tab ───────────────────────────────────────────────────────────────

type TeamDetail = {
  id: string;
  email: string | null;
  lmsUserId: string | null;
  lmsCourseEnrolled: boolean;
  enrolledCourseIds: string[];
  competition: { id: string; code: string; name: string; eptimEduCourseId: string | null; eptimEduCourseTitle: string | null } | null;
  eventCourses: { eventId: string; eventName: string; courseId: string | null; courseTitle: string | null }[];
  members: { id: string; participant: { id: string; name: string; ic: string | null; email: string | null; gender: string; age: number | null; eduLevel: string; status: string } }[];
  trainers: { trainer: { id: string; name: string; ic: string | null; phoneNumber: string | null; status: string } }[];
};

function TeamsTab({ contingentId, teams }: {
  contingentId: string;
  teams: TeamRow[];
}) {
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [details,   setDetails]   = useState<Record<string, TeamDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Per-team, per-course enrolment tracking: teamId → Set of enrolled courseIds
  const [enrolledMap,  setEnrolledMap]  = useState<Record<string, Set<string>>>({});
  const [enrolling,    setEnrolling]    = useState<{ teamId: string; courseId: string } | null>(null);
  const [enrolError,   setEnrolError]   = useState<{ teamId: string; courseId: string; message: string } | null>(null);

  // Seed enrolledMap from EptimEdu-verified course IDs returned by the API
  function seedEnrolled(teamId: string, detail: TeamDetail) {
    const ids = detail.enrolledCourseIds ?? [];
    setEnrolledMap((prev) => ({ ...prev, [teamId]: new Set(ids) }));
  }

  async function handleEnrol(teamId: string, courseId: string, force = false) {
    setEnrolling({ teamId, courseId });
    setEnrolError(null);
    try {
      const res = await fetch(
        `/api/v2/organizer/contingents/${contingentId}/teams/${teamId}/enrol-course`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, force }) },
      );
      const json = await res.json();
      if (!res.ok) {
        setEnrolError({ teamId, courseId, message: json.error ?? "Enrolment failed." });
      } else {
        setEnrolledMap((prev) => {
          const existing = new Set(prev[teamId] ?? []);
          existing.add(courseId);
          return { ...prev, [teamId]: existing };
        });
        // Update cached detail so the badge also reflects enrolled state
        setDetails((prev) => {
          const d = prev[teamId];
          if (!d) return prev;
          const ids = Array.from(new Set([...d.enrolledCourseIds, courseId]));
          return { ...prev, [teamId]: { ...d, lmsCourseEnrolled: true, enrolledCourseIds: ids } };
        });
      }
    } catch {
      setEnrolError({ teamId, courseId, message: "Network error. Please try again." });
    } finally {
      setEnrolling(null);
    }
  }

  async function toggle(teamId: string) {
    if (expanded === teamId) { setExpanded(null); return; }
    setExpanded(teamId);
    if (details[teamId]) return;
    setLoadingId(teamId);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/teams/${teamId}`);
      const json = await res.json();
      setDetails((prev) => ({ ...prev, [teamId]: json }));
      seedEnrolled(teamId, json);
    } finally { setLoadingId(null); }
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm">
        <p className="px-5 py-10 text-center text-sm text-zinc-400">No teams registered.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden divide-y">
      {teams.map((t) => {
        const isOpen    = expanded === t.id;
        const isLoading = loadingId === t.id;
        const detail    = details[t.id];

        const inEvent = t._count.teamEvents > 0;

        return (
          <div key={t.id} className={inEvent ? "border-l-4 border-green-400" : "border-l-4 border-transparent"}>
            {/* Row */}
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${
                inEvent ? "bg-green-50 hover:bg-green-100" : "hover:bg-zinc-50"
              }`}
            >
              <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${inEvent ? "text-green-500" : "text-zinc-400"} ${isOpen ? "rotate-90" : ""}`} />
              <div className="flex-1 min-w-0 grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 truncate">{t.name}</p>
                  {t.competition && <p className="text-xs text-zinc-400 font-mono mt-0.5">{t.competition.code}</p>}
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-zinc-700 truncate text-xs">{t.competition?.name ?? "—"}</p>
                  <p className="text-zinc-400 text-xs">{t.competition?.participationType ?? ""}</p>
                </div>
                <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                  {t._count.members} member{t._count.members !== 1 ? "s" : ""}
                </span>
                {inEvent
                  ? <Badge variant="outline" className="text-xs text-green-700 border-green-400 bg-green-100 whitespace-nowrap">
                      {t._count.teamEvents} event{t._count.teamEvents !== 1 ? "s" : ""}
                    </Badge>
                  : <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-200 bg-zinc-50">No event</Badge>}
                {t.status === "ACTIVE"
                  ? <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Active</Badge>
                  : <Badge variant="outline" className="text-xs text-zinc-500">{t.status}</Badge>}
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
              </div>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="bg-slate-50 border-t px-6 py-5 space-y-5">
                {!detail ? (
                  <p className="text-sm text-zinc-400 text-center py-4">Loading…</p>
                ) : (
                  <>
                    {/* EptimEdu enrolment badge */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold uppercase tracking-widest text-zinc-500">EptimEdu</span>
                      {detail.lmsUserId ? (
                        detail.lmsCourseEnrolled
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-green-700 font-medium">Enrolled</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-yellow-700 font-medium">Account only</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-zinc-500">Not enrolled</span>
                      )}
                      {detail.email && (
                        <span className="text-zinc-400 font-mono">{detail.email}</span>
                      )}
                    </div>

                    {/* Event course assignments */}
                    {detail.eventCourses.length > 0 && (() => {
                      const hasUnenrolled = detail.eventCourses.some(
                        (ec) => ec.courseId && !(enrolledMap[t.id]?.has(ec.courseId)),
                      );
                      return (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                            Course Assignments
                          </h4>

                          {/* Callout — shown only when at least one course is unenrolled */}
                          {hasUnenrolled && (
                            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-amber-800 leading-relaxed">
                                This team has not been enrolled in the assigned course(s) on EptimEdu.
                                Click the <strong>Enrol</strong> button on the relevant row to register them.
                              </p>
                            </div>
                          )}

                          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100 border-b border-slate-200">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Event</th>
                                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Course</th>
                                  <th className="px-3 py-2 text-left font-medium text-zinc-500">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {detail.eventCourses.map((ec) => {
                                  const enrolled = ec.courseId
                                    ? (enrolledMap[t.id]?.has(ec.courseId) ?? false)
                                    : false;
                                  const isEnrolling = enrolling?.teamId === t.id
                                    && enrolling?.courseId === ec.courseId;
                                  const needsEnrol = !!ec.courseId && !enrolled;
                                  return (
                                    <tr key={ec.eventId} className={needsEnrol ? "bg-amber-50/40 hover:bg-amber-50" : "hover:bg-slate-50"}>
                                      <td className="px-3 py-2 text-zinc-700">{ec.eventName}</td>
                                      <td className="px-3 py-2">
                                        {ec.courseId ? (
                                          <span className="text-zinc-800">
                                            {ec.courseTitle ?? ec.courseId}
                                          </span>
                                        ) : (
                                          <span className="text-zinc-400">No course assigned</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        {!ec.courseId ? (
                                          <span className="text-zinc-300">—</span>
                                        ) : enrolled ? (
                                          <span className="inline-flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-green-700 font-medium">
                                              <Check className="h-3 w-3" /> Enrolled
                                            </span>
                                            <button
                                              type="button"
                                              disabled={!!enrolling}
                                              onClick={() => handleEnrol(t.id, ec.courseId!, true)}
                                              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-zinc-500 font-medium hover:bg-zinc-50 hover:text-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                              title="Force re-enrol with correct email"
                                            >
                                              {(enrolling?.teamId === t.id && enrolling?.courseId === ec.courseId)
                                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Re-enrolling…</>
                                                : "Re-enrol"}
                                            </button>
                                          </span>
                                        ) : (
                                          /* Pulsing ring wrapper */
                                          <span className="relative inline-flex">
                                            {!isEnrolling && (
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-40 pointer-events-none" />
                                            )}
                                            <button
                                              type="button"
                                              disabled={isEnrolling || !!enrolling}
                                              onClick={() => handleEnrol(t.id, ec.courseId!)}
                                              className="relative inline-flex items-center gap-1 rounded-full border border-blue-400 bg-blue-600 px-2.5 py-0.5 text-white font-semibold shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                              {isEnrolling
                                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Enrolling…</>
                                                : "Enrol"}
                                            </button>
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Members */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                        Members ({detail.members.length})
                      </h4>
                      {detail.members.length === 0 ? (
                        <p className="text-xs text-zinc-400">No members.</p>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500 w-6">#</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Name</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">IC</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Email</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Gender</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Age</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Level</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {detail.members.map((m, i) => (
                                <tr key={m.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 text-zinc-400 tabular-nums">{i + 1}</td>
                                  <td className="px-3 py-2 font-medium text-zinc-800">{m.participant.name}</td>
                                  <td className="px-3 py-2 text-zinc-500 font-mono">{m.participant.ic ?? "—"}</td>
                                  <td className="px-3 py-2 text-zinc-500">{m.participant.email ?? "—"}</td>
                                  <td className="px-3 py-2 text-zinc-500">{m.participant.gender}</td>
                                  <td className="px-3 py-2 text-zinc-500 tabular-nums">{m.participant.age ?? "—"}</td>
                                  <td className="px-3 py-2 text-zinc-500">{m.participant.eduLevel}</td>
                                  <td className="px-3 py-2">
                                    {m.participant.status === "ACTIVE"
                                      ? <span className="text-green-700">Active</span>
                                      : <span className="text-zinc-400">{m.participant.status}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Trainers */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                        Trainers ({detail.trainers.length})
                      </h4>
                      {detail.trainers.length === 0 ? (
                        <p className="text-xs text-zinc-400">No trainers assigned.</p>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500 w-6">#</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Name</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">IC</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Phone</th>
                                <th className="px-3 py-2 text-left font-medium text-zinc-500">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {detail.trainers.map((tt, i) => (
                                <tr key={tt.trainer.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 text-zinc-400 tabular-nums">{i + 1}</td>
                                  <td className="px-3 py-2 font-medium text-zinc-800">{tt.trainer.name}</td>
                                  <td className="px-3 py-2 text-zinc-500 font-mono">{tt.trainer.ic ?? "—"}</td>
                                  <td className="px-3 py-2 text-zinc-500">{tt.trainer.phoneNumber ?? "—"}</td>
                                  <td className="px-3 py-2">
                                    {tt.trainer.status === "ACTIVE"
                                      ? <span className="text-green-700">Active</span>
                                      : <span className="text-zinc-400">{tt.trainer.status}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Enrolment error modal */}
      <Dialog open={!!enrolError} onOpenChange={(open) => { if (!open) setEnrolError(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Enrolment Failed
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-zinc-700">{enrolError?.message}</p>
            {enrolError && (
              <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-500 font-mono space-y-0.5">
                <p>Team ID: {enrolError.teamId}</p>
                <p>Course ID: {enrolError.courseId}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrolError(null)}>Close</Button>
            <Button
              onClick={() => {
                if (enrolError) {
                  const { teamId, courseId } = enrolError;
                  setEnrolError(null);
                  handleEnrol(teamId, courseId);
                }
              }}
            >
              Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Trainers Tab ────────────────────────────────────────────────────────────

function TrainersTab({ contingentId }: { contingentId: string }) {
  const [rows, setRows]       = useState<TrainerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/organizer/contingents/${contingentId}/trainers`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [contingentId]);

  if (loading) {
    return <p className="text-sm text-zinc-400 py-10 text-center">Loading…</p>;
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-400">No trainers registered.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600 w-8">#</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">IC</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Email</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Phone</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Teams</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t, i) => (
              <tr key={t.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 text-zinc-400 text-xs tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-zinc-900">{t.name}</td>
                <td className="px-4 py-3 text-xs text-zinc-500 font-mono">{t.ic ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{t.email ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{t.phoneNumber ?? "—"}</td>
                <td className="px-4 py-3">
                  {t.teams.length === 0 ? (
                    <span className="text-zinc-300 text-xs">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {t.teams.map((tt, j) => tt.team && (
                        <span key={j} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-100 text-zinc-600 border border-zinc-200">
                          {tt.team.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {t.status === "ACTIVE"
                    ? <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Active</Badge>
                    : <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-300 bg-zinc-50">{t.status}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── IC parsing helpers ───────────────────────────────────────────────────────

type Gender   = "MALE" | "FEMALE";
type EduLevel = "KINDERGARTEN" | "PRIMARY" | "SECONDARY" | "YOUTH";

function parseIcData(ic: string): { gender?: Gender; age?: number; eduLevel?: EduLevel; classGrade?: string } {
  const digits = ic.replace(/\D/g, "");
  if (digits.length !== 12) return {};

  const yy = parseInt(digits.substring(0, 2), 10);
  const mm = parseInt(digits.substring(2, 4), 10);
  const dd = parseInt(digits.substring(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return {};

  const currentYear = new Date().getFullYear();
  const birthYear   = yy <= currentYear % 100 ? 2000 + yy : 1900 + yy;
  const age         = currentYear - birthYear;
  const gender: Gender = parseInt(digits[11], 10) % 2 === 1 ? "MALE" : "FEMALE";

  let eduLevel: EduLevel;
  let classGrade: string | undefined;
  if      (age >= 5 && age <= 6)  { eduLevel = "KINDERGARTEN"; classGrade = age <= 5 ? "Prasekolah 5thn" : "Prasekolah 6thn"; }
  else if (age >= 7 && age <= 12) { eduLevel = "PRIMARY";      classGrade = `Darjah ${age - 6}`; }
  else if (age >= 13 && age <= 17){ eduLevel = "SECONDARY";    classGrade = `Tingkatan ${age - 12}`; }
  else                             { eduLevel = "YOUTH"; }

  return { gender, age, eduLevel, classGrade };
}

// ─── Add Participant Dialog ───────────────────────────────────────────────────

type ParticipantForm = {
  name: string; ic: string; email: string; phoneNumber: string;
  gender: string; age: number | null; eduLevel: string;
  classGrade: string; className: string; ppki: boolean;
};

const BLANK_FORM: ParticipantForm = {
  name: "", ic: "", email: "", phoneNumber: "",
  gender: "MALE", age: null, eduLevel: "SECONDARY",
  classGrade: "", className: "", ppki: false,
};

function AddParticipantDialog({
  contingentId, open, onClose, onAdded,
}: {
  contingentId: string; open: boolean; onClose: () => void; onAdded: (p: Participant) => void;
}) {
  const [form, setForm] = useState<ParticipantForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => { if (open) { setForm(BLANK_FORM); setError(null); } }, [open]);

  function handleIcChange(val: string) {
    const parsed = parseIcData(val);
    setForm((f) => ({
      ...f, ic: val,
      ...(parsed.gender    ? { gender:    parsed.gender }    : {}),
      ...(parsed.age       ? { age:       parsed.age }       : {}),
      ...(parsed.eduLevel  ? { eduLevel:  parsed.eduLevel }  : {}),
      ...(parsed.classGrade ? { classGrade: parsed.classGrade } : {}),
    }));
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/participants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Save failed"); return; }
      onAdded(json.data); onClose();
    } catch { setError("Network error"); }
    finally   { setSaving(false); }
  }

  const f   = (k: keyof ParticipantForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const sel = (k: keyof ParticipantForm) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const selCls = "mt-1 block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm max-h-[70vh] overflow-y-auto">
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={f("name")} className="mt-1" placeholder="Full name" />
          </div>
          <div>
            <Label>IC / Passport</Label>
            <Input value={form.ic} onChange={(e) => handleIcChange(e.target.value)} className="mt-1" placeholder="12-digit IC" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phoneNumber} onChange={f("phoneNumber")} className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={f("email")} className="mt-1" />
          </div>
          <div>
            <Label>Gender *</Label>
            <select value={form.gender} onChange={sel("gender")} className={selCls}>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
            </select>
          </div>
          <div>
            <Label>Age</Label>
            <Input type="number" value={form.age ?? ""} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value ? Number(e.target.value) : null }))} className="mt-1" />
          </div>
          <div>
            <Label>Education Level *</Label>
            <select value={form.eduLevel} onChange={sel("eduLevel")} className={selCls}>
              {EDU_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Class Grade</Label>
            <Input value={form.classGrade} onChange={f("classGrade")} className="mt-1" placeholder="e.g. Darjah 5" />
          </div>
          <div>
            <Label>Class Name</Label>
            <Input value={form.className} onChange={f("className")} className="mt-1" placeholder="e.g. Cerdas" />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" id="add-ppki" checked={form.ppki} onChange={(e) => setForm((p) => ({ ...p, ppki: e.target.checked }))} />
            <Label htmlFor="add-ppki">PPKI</Label>
          </div>
        </div>
        {error && <p className="px-6 pb-2 text-red-600 text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.gender || !form.eduLevel}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : "Add Participant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Upload Dialog ───────────────────────────────────────────────────────

type BulkPhase = "upload" | "preview" | "cleaning" | "confirm" | "done";

type CleanRow = {
  name: string; ic: string | null; email: string | null; phoneNumber: string | null;
  gender: string; age: number | null; eduLevel: string;
  classGrade: string | null; className: string | null;
  ethnicity: string | null; ppki: boolean;
};

function parseCsvText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  });
}

function BulkUploadDialog({
  contingentId, open, onClose, onDone,
}: {
  contingentId: string; open: boolean; onClose: () => void; onDone: (count: number) => void;
}) {
  const [phase, setPhase]   = useState<BulkPhase>("upload");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<string[][]>([]);
  const [cleaned, setCleaned] = useState<CleanRow[]>([]);
  const [errors,  setErrors]  = useState<string[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPhase("upload"); setCsvText(""); setPreview([]); setCleaned([]);
      setErrors([]); setSaving(false); setErr("");
    }
  }, [open]);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      setPreview(parseCsvText(text).slice(0, 6));
      setPhase("preview");
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleClean() {
    setPhase("cleaning"); setErr("");
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/participants/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "AI cleaning failed"); setPhase("preview"); return; }
      setCleaned(json.data ?? []);
      setErrors(json.errors ?? []);
      setPhase("confirm");
    } catch { setErr("Network error"); setPhase("preview"); }
  }

  async function handleConfirm() {
    setSaving(true); setErr("");
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/participants/bulk-confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: cleaned }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Import failed"); setSaving(false); return; }
      setPhase("done");
      onDone(json.created ?? cleaned.length);
    } catch { setErr("Network error"); setSaving(false); }
  }

  const SAMPLE_CSV = `name,ic,gender,age,eduLevel,classGrade,className,email,phoneNumber,ppki
Ahmad Bin Ali,010203042345,MALE,15,SECONDARY,Tingkatan 3,Wawasan,ahmad@email.com,0123456789,
Siti Binti Lim,020405046789,FEMALE,14,SECONDARY,Tingkatan 2,Bestari,,,`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-zinc-500" />
            Bulk Upload Participants
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">

          {/* Step indicator */}
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            {(["upload","preview","cleaning","confirm","done"] as BulkPhase[]).map((s, i, arr) => (
              <span key={s} className="flex items-center gap-1">
                <span className={phase === s ? "font-semibold text-zinc-700" : ""}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
                {i < arr.length - 1 && <span>›</span>}
              </span>
            ))}
          </div>

          {phase === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-400 transition-colors"
              >
                <Upload className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                <p className="font-medium text-zinc-600">Click to upload CSV</p>
                <p className="text-xs text-zinc-400 mt-1">UTF-8 encoded, comma-separated</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

              <div className="rounded-lg border bg-zinc-50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Sample CSV format</p>
                  <button
                    onClick={() => { const a = document.createElement("a"); a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`; a.download = "participants-template.csv"; a.click(); }}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" /> Download template
                  </button>
                </div>
                <pre className="text-[10px] text-zinc-500 overflow-x-auto whitespace-pre">{SAMPLE_CSV}</pre>
              </div>
            </div>
          )}

          {phase === "preview" && (
            <div className="space-y-3">
              <p className="text-zinc-600">Preview (first 6 rows). AI will clean and normalize all data.</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={i === 0 ? "bg-zinc-100 font-semibold" : "border-t"}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1.5 whitespace-nowrap max-w-[120px] truncate">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {err && <p className="text-red-600 text-xs">{err}</p>}
            </div>
          )}

          {phase === "cleaning" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Sparkles className="h-8 w-8 text-violet-500 animate-pulse" />
              <p className="font-medium text-zinc-700">AI is cleaning and normalizing your data…</p>
              <p className="text-xs text-zinc-400">This may take a few seconds</p>
            </div>
          )}

          {phase === "confirm" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <p className="font-medium text-zinc-700">{cleaned.length} participant{cleaned.length !== 1 ? "s" : ""} ready to import</p>
              </div>
              {errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700">{errors.length} row{errors.length !== 1 ? "s" : ""} skipped:</p>
                  {errors.map((e, i) => <p key={i} className="text-xs text-amber-600">• {e}</p>)}
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 sticky top-0">
                    <tr>
                      {["Name","IC","Gender","Age","Level","Grade","Class","PPKI"].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-semibold text-zinc-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cleaned.map((r, i) => (
                      <tr key={i} className="hover:bg-zinc-50">
                        <td className="px-2 py-1.5 whitespace-nowrap font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 font-mono">{r.ic ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.gender}</td>
                        <td className="px-2 py-1.5">{r.age ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.eduLevel}</td>
                        <td className="px-2 py-1.5">{r.classGrade ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.className ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.ppki ? "✓" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {err && <p className="text-red-600 text-xs">{err}</p>}
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="font-semibold text-zinc-700">Import complete!</p>
              <p className="text-xs text-zinc-400">{cleaned.length} participants added to this contingent.</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-4">
          {phase === "upload" && <Button variant="outline" onClick={onClose}>Cancel</Button>}
          {phase === "preview" && (
            <>
              <Button variant="outline" onClick={() => setPhase("upload")}>Back</Button>
              <Button onClick={handleClean} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Clean with AI
              </Button>
            </>
          )}
          {phase === "cleaning" && <Button variant="outline" disabled>Processing…</Button>}
          {phase === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setPhase("preview")} disabled={saving}>Back</Button>
              <Button onClick={handleConfirm} disabled={saving || cleaned.length === 0} className="gap-1.5">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Importing…</> : `Import ${cleaned.length} participants`}
              </Button>
            </>
          )}
          {phase === "done" && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Participant Dialog ──────────────────────────────────────────────────

function EditParticipantDialog({
  contingentId, participant, open, onClose, onSaved,
}: {
  contingentId: string; participant: Participant | null;
  open: boolean; onClose: () => void; onSaved: (updated: Participant) => void;
}) {
  const [form, setForm] = useState<Omit<Participant, "id" | "ppki" | "createdAt"> & { ppki: boolean }>(() =>
    participant
      ? {
          name: participant.name, ic: participant.ic ?? "", email: participant.email ?? "",
          phoneNumber: participant.phoneNumber ?? "", gender: participant.gender,
          age: participant.age, eduLevel: participant.eduLevel,
          classGrade: participant.classGrade ?? "", className: participant.className ?? "",
          status: participant.status, ppki: participant.ppki,
        }
      : { name: "", ic: "", email: "", phoneNumber: "", gender: "MALE", age: null,
          eduLevel: "SECONDARY", classGrade: "", className: "", status: "ACTIVE", ppki: false }
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleSave() {
    if (!participant) return;
    setSaving(true); setError(null);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/participants/${participant.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Save failed"); return; }
      onSaved(json.data); onClose();
    } catch { setError("Network error"); }
    finally   { setSaving(false); }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const selCls = "mt-1 block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Participant</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={f("name")} className="mt-1" />
          </div>
          <div>
            <Label>IC / Passport</Label>
            <Input value={form.ic ?? ""} onChange={f("ic")} className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phoneNumber ?? ""} onChange={f("phoneNumber")} className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={f("email")} className="mt-1" />
          </div>
          <div>
            <Label>Gender *</Label>
            <select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className={selCls}>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
            </select>
          </div>
          <div>
            <Label>Age</Label>
            <Input type="number" value={form.age ?? ""} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value ? Number(e.target.value) : null }))} className="mt-1" />
          </div>
          <div>
            <Label>Education Level *</Label>
            <select value={form.eduLevel} onChange={(e) => setForm((p) => ({ ...p, eduLevel: e.target.value }))} className={selCls}>
              {EDU_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Class Grade</Label>
            <Input value={form.classGrade ?? ""} onChange={f("classGrade")} className="mt-1" />
          </div>
          <div>
            <Label>Class Name</Label>
            <Input value={form.className ?? ""} onChange={f("className")} className="mt-1" />
          </div>
          <div>
            <Label>Status</Label>
            <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className={selCls}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" id="ppki" checked={form.ppki} onChange={(e) => setForm((p) => ({ ...p, ppki: e.target.checked }))} />
            <Label htmlFor="ppki">PPKI</Label>
          </div>
        </div>
        {error && <p className="px-6 pb-2 text-red-600 text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk remove dialog ───────────────────────────────────────────────────────

function BulkRemoveParticipantsDialog({
  open, contingentId, selectedIds, selectedNames, onClose, onRemoved,
}: {
  open: boolean;
  contingentId: string;
  selectedIds: string[];
  selectedNames: string[];
  onClose: () => void;
  onRemoved: (deletedIds: string[]) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [error,    setError]    = useState("");

  async function handleRemove() {
    setRemoving(true); setError("");
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/participants`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      onRemoved(selectedIds);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Remove failed");
      setRemoving(false);
    }
  }

  const preview = selectedNames.slice(0, 5);
  const overflow = selectedNames.length - preview.length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !removing) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" /> Remove {selectedIds.length} Participant{selectedIds.length !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-semibold">This action cannot be undone.</p>
              <p>The following participant{selectedIds.length !== 1 ? "s" : ""} will be permanently removed from this contingent:</p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-amber-700">
                {preview.map((name, i) => <li key={i} className="truncate">• {name}</li>)}
                {overflow > 0 && <li className="text-amber-500">… and {overflow} more</li>}
              </ul>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={removing}>Cancel</Button>
          <Button variant="destructive" disabled={removing} onClick={handleRemove} className="gap-1.5">
            {removing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Removing…</>
              : <><Trash2 className="h-4 w-4" /> Remove {selectedIds.length} Participant{selectedIds.length !== 1 ? "s" : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Participants Tab ─────────────────────────────────────────────────────────

function incompleteIc(p: Participant) {
  return !p.ic || p.ic.replace(/\D/g, "").length < 12;
}

function ParticipantsTab({ contingentId }: { contingentId: string }) {
  const [q, setQ]           = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [pageSize]          = useState(20);
  const [result, setResult] = useState<ParticipantsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [addOpen,  setAddOpen]  = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async (q: string, p: number) => {
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}/participants?${params}`);
      const json = await res.json();
      setResult(json);
    } finally { setLoading(false); }
  }, [contingentId, pageSize]);

  useEffect(() => { fetchPage(search, page); }, [search, page, fetchPage]);

  function handleInput(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); setSelected(new Set()); }, 300);
  }

  function handleSaved(updated: Participant) {
    setResult((prev) => prev ? { ...prev, data: prev.data.map((p) => p.id === updated.id ? updated : p) } : prev);
  }

  function handleAdded(p: Participant) {
    setResult((prev) => prev
      ? { ...prev, total: prev.total + 1, data: [p, ...prev.data].slice(0, pageSize) }
      : prev
    );
    setAddOpen(false);
  }

  function handleBulkDone(count: number) {
    // Refresh from page 1 to show new entries
    setPage(1);
    fetchPage(search, 1);
    setBulkOpen(false);
    void count;
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const pageIds = result?.data.map((p) => p.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.add(id)); return next; });
    }
  }

  function handleBulkRemoved(deletedIds: string[]) {
    const deleted = new Set(deletedIds);
    setResult((prev) => prev
      ? { ...prev, total: prev.total - deletedIds.length, data: prev.data.filter((p) => !deleted.has(p.id)) }
      : prev
    );
    setSelected(new Set());
    setBulkRemoveOpen(false);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / pageSize)) : 1;
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd   = result ? Math.min(page * pageSize, result.total) : 0;

  const selectedNames = (result?.data ?? [])
    .filter((p) => selected.has(p.id))
    .map((p) => p.name);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input value={q} onChange={(e) => handleInput(e.target.value)}
            placeholder="Search name, IC, email, class…" className="pl-9" />
        </div>

        {selected.size > 0 ? (
          <button
            onClick={() => setBulkRemoveOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-sm text-red-700 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove selected ({selected.size})
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-zinc-400">
            {result ? `${result.total.toLocaleString()} participant${result.total !== 1 ? "s" : ""}` : ""}
          </span>
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 text-sm text-violet-700 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Upload
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 text-sm text-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Participant
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-amber-700">
        <span className="inline-block h-3 w-3 rounded-sm bg-amber-100 border border-amber-300 shrink-0" />
        Incomplete IC (fewer than 12 digits)
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="pl-4 pr-2 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600 w-8">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">IC</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Gender</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Age</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Edu Level</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Class</th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Status</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && !result ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-400">Loading…</td></tr>
              ) : !result?.data.length ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-400">No participants found.</td></tr>
              ) : (
                result.data.map((p, i) => {
                  const incomplete = incompleteIc(p);
                  const isSelected = selected.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSelected
                          ? incomplete ? "bg-amber-100" : "bg-blue-50"
                          : incomplete ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-zinc-50"
                      }`}
                    >
                      <td className="pl-4 pr-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums">{rangeStart + i}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-zinc-900">{p.name}</p>
                        {p.email && <p className="text-xs text-zinc-400">{p.email}</p>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {p.ic
                          ? <span className={incomplete ? "text-amber-700 font-semibold" : "text-zinc-500"}>{p.ic}</span>
                          : <span className="text-amber-600 font-semibold italic">—</span>}
                        {incomplete && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0 text-[10px] text-amber-700 font-normal not-italic">
                            {p.ic ? `${p.ic.replace(/\D/g, "").length}/12` : "missing"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-600">{p.gender}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-zinc-600">{p.age ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-600">{p.eduLevel}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-600">
                        {[p.classGrade, p.className].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.status === "ACTIVE"
                          ? <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Active</Badge>
                          : <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-300 bg-zinc-50">{p.status}</Badge>}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setEditing(p)} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {result && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-zinc-50 text-sm">
            <span className="text-zinc-500">Showing {rangeStart}–{rangeEnd} of {result.total.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded border disabled:opacity-40 hover:bg-white transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-zinc-600 tabular-nums">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded border disabled:opacity-40 hover:bg-white transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AddParticipantDialog
        contingentId={contingentId}
        open={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded}
      />

      <BulkUploadDialog
        contingentId={contingentId}
        open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={handleBulkDone}
      />

      <EditParticipantDialog
        key={editing?.id ?? "none"}
        contingentId={contingentId} participant={editing}
        open={!!editing} onClose={() => setEditing(null)} onSaved={handleSaved}
      />

      <BulkRemoveParticipantsDialog
        open={bulkRemoveOpen}
        contingentId={contingentId}
        selectedIds={[...selected]}
        selectedNames={selectedNames}
        onClose={() => setBulkRemoveOpen(false)}
        onRemoved={handleBulkRemoved}
      />
    </div>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

function DeleteContingentDialog({
  open, name, contingentId, onClose, onDeleted,
}: {
  open: boolean;
  name: string;
  contingentId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [code]                  = useState(() => genCode());
  const [input,    setInput]    = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState("");

  async function handleDelete() {
    if (input !== code) return;
    setDeleting(true); setError("");
    try {
      const res = await fetch(`/api/v2/organizer/contingents/${contingentId}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        let msg = "Delete failed";
        try { msg = JSON.parse(text)?.error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      onDeleted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !deleting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" /> Delete Contingent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">This action cannot be undone.</p>
              <p>All data associated with <span className="font-semibold">{name}</span> will be permanently deleted:</p>
              <ul className="list-disc list-inside text-xs mt-1 space-y-0.5 text-amber-700 dark:text-amber-400">
                <li>All manager accounts linked to this contingent</li>
                <li>All participants and their sessions</li>
                <li>All trainers</li>
                <li>All teams and team memberships</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Type the confirmation code below to enable delete:</p>
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-center">
              <p className="text-2xl font-mono font-bold tracking-[0.35em] text-red-600 select-all">{code}</p>
            </div>
            <input
              type="text"
              autoComplete="off"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono tracking-[0.3em] text-center uppercase focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder={code.split("").map(() => "_").join(" ")}
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 5))}
              disabled={deleting}
              onKeyDown={(e) => { if (e.key === "Enter" && input === code) handleDelete(); }}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={input !== code || deleting}
            onClick={handleDelete}
            className="gap-1.5"
          >
            {deleting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
              : <><Trash2 className="h-4 w-4" /> Delete Contingent</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ContingentOrgDetailClient({ contingentId }: { contingentId: string }) {
  const router = useRouter();
  const [detail, setDetail]   = useState<ContingentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("Details");
  const [deleteOpen, setDeleteOpen] = useState(false);

  // short-name inline edit
  const [editingShortName, setEditingShortName] = useState(false);
  const [shortNameDraft,   setShortNameDraft]   = useState("");
  const [pendingField,     setPendingField]      = useState<PendingChange | null>(null);
  const [savingField,      setSavingField]       = useState(false);

  async function applyFieldPatch(body: Record<string, unknown>) {
    setSavingField(true);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents/${contingentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) setDetail((prev) => prev ? { ...prev, shortName: json.shortName ?? prev.shortName } : prev);
    } finally { setSavingField(false); }
  }

  function openShortNameEdit() {
    setShortNameDraft(detail?.shortName ?? "");
    setEditingShortName(true);
  }

  function submitShortName() {
    const trimmed = shortNameDraft.trim();
    const current = detail?.shortName ?? "";
    if (trimmed === current) { setEditingShortName(false); return; }
    setEditingShortName(false);
    setPendingField({
      label: trimmed
        ? `Update short name to "${trimmed}".`
        : `Clear the short name (currently "${current}").`,
      body: { shortName: trimmed || null },
    });
  }

  useEffect(() => {
    fetch(`/api/v2/organizer/contingents/${contingentId}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [contingentId]);

  if (loading) {
    return <div className="p-6 max-w-5xl mx-auto"><p className="text-zinc-400 text-sm">Loading…</p></div>;
  }
  if (!detail || (detail as { error?: string }).error) {
    return <div className="p-6 max-w-5xl mx-auto"><p className="text-red-500 text-sm">Contingent not found.</p></div>;
  }

  const showSchool = detail.contingentType === "SCHOOL" || !!detail.school;
  const showHI     = detail.contingentType === "HIGHER" || !!detail.higherInstitution;
  const showInstitutionCard = showSchool || showHI || detail.contingentType === "INDEPENDENT";

  function handleInstitutionUpdated(patch: { school: SchoolDetail | null; higherInstitution: HIDetail | null; name?: string }) {
    setDetail((prev) => {
      if (!prev) return prev;
      const s = patch.school;
      const h = patch.higherInstitution;
      const stateName = s?.state?.name ?? h?.state?.name ?? prev.state?.name ?? null;
      const stateCode = s?.state?.code ?? h?.state?.code ?? prev.state?.code ?? null;
      const zoneName  =
        s?.zone?.name ??
        s?.state?.zoneStates?.[0]?.zone?.name ??
        h?.state?.zoneStates?.[0]?.zone?.name ??
        prev.zone?.name ??
        prev.state?.zoneStates?.[0]?.zone?.name ??
        null;
      return { ...prev, ...patch, ...(patch.name ? { name: patch.name } : {}), stateName, stateCode, zoneName };
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back + heading */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="mt-0.5 text-zinc-400 hover:text-zinc-700 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold leading-tight">{detail.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLOR[detail.contingentType]}`}>
              {TYPE_LABEL[detail.contingentType]}
            </span>
            {detail.status !== "ACTIVE" && (
              <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 text-xs">Suspended</Badge>
            )}
          </div>
          {detail.shortName && <p className="text-sm text-zinc-400 mt-0.5">{detail.shortName}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-zinc-500"><Users className="h-4 w-4" /> {detail.managers.length}</span>
            <span className="flex items-center gap-1.5 text-zinc-500"><UserCheck className="h-4 w-4" /> {detail._count.participants}</span>
            <span className="flex items-center gap-1.5 text-zinc-500"><Trophy className="h-4 w-4" /> {detail.teams.length}</span>
          </div>
          <button
            onClick={() => setDeleteOpen(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            title="Delete contingent"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Details ── */}
      {tab === "Details" && (
        <div className="space-y-4">
          {/* Contingent meta */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 bg-white rounded-xl border p-5 shadow-sm">
            <Dl label="Full Name" value={detail.name} />
            <div>
              <dt className="text-xs text-zinc-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
                Short Name
                {!editingShortName && (
                  <button onClick={openShortNameEdit} className="text-zinc-300 hover:text-zinc-600 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </dt>
              <dd className="mt-0.5">
                {editingShortName ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={shortNameDraft}
                      onChange={(e) => setShortNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitShortName(); if (e.key === "Escape") setEditingShortName(false); }}
                      className="h-7 text-sm py-0 px-2"
                      placeholder="Short name…"
                      autoFocus
                    />
                    <button onClick={submitShortName} className="text-green-600 hover:text-green-700">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingShortName(false)} className="text-zinc-400 hover:text-zinc-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-zinc-800">{detail.shortName ?? <span className="text-zinc-300">—</span>}</span>
                )}
              </dd>
            </div>
            <Dl label="Type" value={TYPE_LABEL[detail.contingentType]} />
            <Dl label="Status" value={
              detail.status === "ACTIVE"
                ? <span className="text-green-700">Active</span>
                : <span className="text-red-600">Suspended</span>
            } />
            <Dl label="State" value={detail.stateName ? `${detail.stateName}${detail.stateCode ? ` (${detail.stateCode})` : ""}` : null} />
            <Dl label="Zone" value={detail.zoneName} />
            <Dl label="Locality" value={detail.locality} />
            <Dl label="Registered" value={new Date(detail.createdAt).toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" })} />
            <Dl label="Last Updated" value={new Date(detail.updatedAt).toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" })} />
          </dl>

          {/* Institution card */}
          {showInstitutionCard && (
            <InstitutionCard
              contingentId={detail.id}
              contingentType={detail.contingentType}
              school={detail.school}
              hi={detail.higherInstitution}
              onUpdated={handleInstitutionUpdated}
            />
          )}
        </div>
      )}

      {/* short-name confirm dialog */}
      {pendingField && (
        <ConfirmChangeDialog
          pending={pendingField}
          onConfirm={(body) => { setPendingField(null); applyFieldPatch(body); }}
          onCancel={() => setPendingField(null)}
        />
      )}
      {savingField && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-zinc-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </div>
      )}

      {/* ── Managers ── */}
      {tab === "Managers" && (
        <ManagersTab
          contingentId={contingentId}
          managers={detail.managers}
          onManagersUpdated={(managers) => setDetail((prev) => prev ? { ...prev, managers } : prev)}
        />
      )}

      {/* ── Trainers ── */}
      {tab === "Trainers" && <TrainersTab contingentId={contingentId} />}

      {/* ── Teams ── */}
      {tab === "Teams" && <TeamsTab contingentId={contingentId} teams={detail.teams} />}

      {/* ── Participants ── */}
      {tab === "Participants" && <ParticipantsTab contingentId={contingentId} />}

      <DeleteContingentDialog
        key={String(deleteOpen)}
        open={deleteOpen}
        name={detail.name}
        contingentId={contingentId}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.push("/organizer/contingents")}
      />
    </div>
  );
}
