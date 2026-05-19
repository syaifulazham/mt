"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Pencil, Upload, Loader2, AlertCircle, Users, CheckCircle2,
  ImagePlus, Bell, Check, X, Clock, UserCircle2, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveManager = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

type PendingRequest = {
  id: string;
  managerId: string;
  createdAt: string;
  requestMessage: string | null;
  manager: { name: string; email: string; phone: string | null };
};

type StateOption = { id: string; name: string };

type Contingent = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  contingentType: string;
  managerRole: string;
  managerStatus: string;
  status: string;
  school:            { name: string } | null;
  higherInstitution: { name: string } | null;
  state:             { id: string; name: string } | null;
  _count: { participants: number; teams: number };
  activeManagers: ActiveManager[];
  pendingJoinRequests: PendingRequest[];
};

// ── Built-in SVG logos ────────────────────────────────────────────────────────

const BUILTIN_LOGOS = [
  {
    id: "shield",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L4 6v6c0 4.4 3.4 8.5 8 9.9 4.6-1.4 8-5.5 8-9.9V6L12 2z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "cog",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: "crank",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="12" r="2.5" />
        <circle cx="19" cy="7" r="2.5" />
        <line x1="7.5" y1="12" x2="12" y2="12" />
        <line x1="12" y1="12" x2="12" y2="7" />
        <line x1="12" y1="7" x2="16.5" y2="7" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "robot",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="9" width="10" height="9" rx="1.5" />
        <rect x="9" y="12" width="2" height="2" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="13" y="12" width="2" height="2" rx="0.5" fill="currentColor" stroke="none" />
        <line x1="10" y1="17" x2="14" y2="17" />
        <line x1="12" y1="9" x2="12" y2="6" />
        <circle cx="12" cy="5" r="1.5" />
        <line x1="7" y1="13" x2="5" y2="13" />
        <line x1="17" y1="13" x2="19" y2="13" />
      </svg>
    ),
  },
  {
    id: "drone",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2.5" />
        <line x1="12" y1="9.5" x2="12" y2="5" />
        <line x1="12" y1="14.5" x2="12" y2="19" />
        <line x1="9.5" y1="12" x2="5" y2="12" />
        <line x1="14.5" y1="12" x2="19" y2="12" />
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
      </svg>
    ),
  },
  {
    id: "rocket",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C12 2 7 6 7 13H17C17 6 12 2 12 2Z" />
        <path d="M7 13l-2 5h14l-2-5" />
        <line x1="12" y1="13" x2="12" y2="18" />
        <path d="M7 13c-1 0-2 1-2 2" />
        <path d="M17 13c1 0 2 1 2 2" />
        <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
] as const;

type BuiltinId = (typeof BUILTIN_LOGOS)[number]["id"];
const DEFAULT_BUILTIN: BuiltinId = "shield";

const LOGO_COLORS: Record<BuiltinId, string> = {
  shield: "text-blue-600  bg-blue-50  border-blue-200",
  cog:    "text-zinc-600  bg-zinc-100 border-zinc-200",
  crank:  "text-amber-600 bg-amber-50 border-amber-200",
  robot:  "text-green-600 bg-green-50 border-green-200",
  drone:  "text-purple-600 bg-purple-50 border-purple-200",
  rocket: "text-red-600   bg-red-50   border-red-200",
};

// ── ContingentLogo ────────────────────────────────────────────────────────────

function ContingentLogo({ logoUrl, size = 56 }: { logoUrl: string | null; size?: number }) {
  const builtinId: BuiltinId = (() => {
    if (!logoUrl) return DEFAULT_BUILTIN;
    if (logoUrl.startsWith("builtin:")) return (logoUrl.replace("builtin:", "") as BuiltinId) ?? DEFAULT_BUILTIN;
    return null as unknown as BuiltinId;
  })();

  const colorClass = builtinId ? (LOGO_COLORS[builtinId] ?? LOGO_COLORS.shield) : "";

  if (builtinId) {
    const found = BUILTIN_LOGOS.find((l) => l.id === builtinId) ?? BUILTIN_LOGOS[0];
    return (
      <div
        className={`rounded-xl border flex items-center justify-center ${colorClass}`}
        style={{ width: size, height: size, minWidth: size }}
      >
        <div style={{ width: size * 0.58, height: size * 0.58 }}>{found.svg}</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, minWidth: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl!} alt="Logo" style={{ width: size, height: size, objectFit: "contain" }} />
    </div>
  );
}

// ── Logo Picker ───────────────────────────────────────────────────────────────

function LogoPicker({
  value,
  onChange,
  contingentId,
  onUploaded,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  contingentId: string;
  onUploaded: (url: string) => void;
}) {
  const t = useTranslations("contingents");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const currentBuiltin: BuiltinId | null = (() => {
    if (!value) return DEFAULT_BUILTIN;
    if (value.startsWith("builtin:")) return value.replace("builtin:", "") as BuiltinId;
    return null;
  })();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/v2/manager/contingents/${contingentId}/logo`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      onUploaded(j.url);
      onChange(j.url);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <Label>{t("logoLabel")}</Label>

      <div className="grid grid-cols-4 gap-2">
        {BUILTIN_LOGOS.map((l) => {
          const selected = currentBuiltin === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange(`builtin:${l.id}`)}
              className={`relative rounded-xl border-2 p-2 flex flex-col items-center gap-1 transition-all ${
                selected
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-zinc-200 hover:border-zinc-300 bg-white"
              }`}
              title={t(`logoBuiltin.${l.id}`)}
            >
              <ContingentLogo logoUrl={`builtin:${l.id}`} size={36} />
              <span className="text-[9px] text-zinc-500 leading-none">{t(`logoBuiltin.${l.id}`)}</span>
              {selected && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-4 py-3">
        {value && !value.startsWith("builtin:") ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Custom logo" className="h-10 w-10 rounded-lg object-contain border" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-700">{t("logoCustomUploaded")}</p>
              <p className="text-[11px] text-zinc-400 truncate">{value}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-xs text-zinc-500 h-7"
              onClick={() => onChange(`builtin:${DEFAULT_BUILTIN}`)}>
              {t("logoRemove")}
            </Button>
          </>
        ) : (
          <>
            <ImagePlus className="h-5 w-5 text-zinc-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-zinc-600">{t("logoUploadOwn")}</p>
              <p className="text-[11px] text-zinc-400">{t("logoUploadHint")}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />{t("logoUploading")}</>
                : <><Upload className="h-3.5 w-3.5 mr-1" />{t("logoBrowse")}</>}
            </Button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden" onChange={handleFile} />
      </div>
      {uploadError && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" />{uploadError}
        </p>
      )}
    </div>
  );
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  contingent,
  onClose,
  onSaved,
}: {
  contingent: Contingent | null;
  onClose: () => void;
  onSaved: (c: Contingent) => void;
}) {
  const t = useTranslations("contingents");
  const [name,      setName]      = useState("");
  const [shortName, setShortName] = useState("");
  const [logoUrl,   setLogoUrl]   = useState<string | null>(null);
  const [stateId,   setStateId]   = useState("");
  const [states,    setStates]    = useState<StateOption[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const needsState = contingent?.contingentType === "INDEPENDENT" || contingent?.contingentType === "INTERNATIONAL";

  useEffect(() => {
    if (!contingent) return;
    setName(contingent.name);
    setShortName(contingent.shortName ?? "");
    setLogoUrl(contingent.logoUrl ?? `builtin:${DEFAULT_BUILTIN}`);
    setStateId(contingent.state?.id ?? "");
    setError("");
  }, [contingent]);

  useEffect(() => {
    if (!needsState || states.length > 0) return;
    fetch("/api/v2/reference/states")
      .then(r => r.json())
      .then(j => setStates(j.data ?? []));
  }, [needsState, states.length]);

  async function handleSave() {
    if (!contingent) return;
    if (!name.trim()) { setError(t("nameRequired")); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/v2/manager/contingents/${contingent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, shortName, logoUrl, ...(needsState && { stateId }) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? t("saveFailed"));
      onSaved({ ...contingent, ...j.data });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!contingent} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">{t("editDesc")}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">{t("nameLabel")} <span className="text-red-500">*</span></Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SMK Bukit Bintang" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-short">
              {t("shortNameLabel")}{" "}
              <span className="text-zinc-400 font-normal text-xs">{t("shortNameOptional")}</span>
            </Label>
            <Input id="c-short" value={shortName} onChange={(e) => setShortName(e.target.value)}
              placeholder="e.g. SMKBB" maxLength={12} />
            <p className="text-[11px] text-zinc-400">{t("shortNameHint")}</p>
          </div>

          {/* State selector — required for INDEPENDENT / INTERNATIONAL */}
          {needsState && (
            <div className="space-y-1.5">
              <Label htmlFor="c-state">
                State <span className="text-red-500">*</span>
              </Label>
              <select
                id="c-state"
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select state…</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-400">Required to participate in zone or state-level events.</p>
            </div>
          )}

          {contingent && (
            <LogoPicker value={logoUrl} onChange={setLogoUrl}
              contingentId={contingent.id} onUploaded={setLogoUrl} />
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-5 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("cancelBtn")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{t("saveBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Managers Section ──────────────────────────────────────────────────────────

function ManagersSection({ managers }: { managers: ActiveManager[] }) {
  const t = useTranslations("contingents");

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        {t("managersHeading")}
      </p>
      {managers.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">{t("noOtherManagers")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {managers.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1"
            >
              <UserCircle2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="text-xs font-medium text-zinc-700 leading-none">{m.name}</span>
              <span className="text-[10px] text-zinc-400 leading-none">
                {t(`roleLabel.${m.role}` as Parameters<typeof t>[0])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Join Requests Panel ───────────────────────────────────────────────────────

function JoinRequestsPanel({
  contingentId,
  requests,
  onUpdate,
}: {
  contingentId: string;
  requests: PendingRequest[];
  onUpdate: () => void;
}) {
  const t = useTranslations("contingents");
  const [acting, setActing] = useState<string | null>(null);

  async function respond(requestId: string, action: "APPROVE" | "REJECT") {
    setActing(requestId);
    try {
      await fetch(
        `/api/v2/manager/contingents/${contingentId}/join-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      onUpdate();
    } finally {
      setActing(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-xs uppercase tracking-wide">
        <Bell className="h-3.5 w-3.5" />
        {requests.length}{" "}
        {requests.length === 1 ? "pending join request" : "pending join requests"}
      </div>

      {requests.map((req) => (
        <div key={req.id}
          className="flex items-center gap-3 bg-white rounded-md border border-amber-100 px-3 py-2.5">
          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
            {req.manager.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{req.manager.name}</p>
            <p className="text-xs text-zinc-400 truncate">{req.manager.email}</p>
            {req.requestMessage && (
              <p className="text-xs text-zinc-500 mt-0.5 italic">"{req.requestMessage}"</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => respond(req.id, "APPROVE")}
              disabled={acting === req.id}
              title={t("approveBtn")}
              className="h-7 w-7 rounded-md bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              {acting === req.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => respond(req.id, "REJECT")}
              disabled={acting === req.id}
              title={t("rejectBtn")}
              className="h-7 w-7 rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Contingent Card ───────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  OWNER:   "bg-amber-50 text-amber-700 border-amber-200",
  MANAGER: "bg-blue-50 text-blue-700 border-blue-200",
};

function ContingentCard({
  contingent,
  onEdit,
  onRefresh,
}: {
  contingent: Contingent;
  onEdit: (c: Contingent) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("contingents");

  const institution =
    contingent.school?.name ??
    contingent.higherInstitution?.name ??
    contingent.state?.name ??
    "—";

  const isPending = contingent.managerStatus === "PENDING";

  return (
    <div className={`rounded-xl border bg-white shadow-sm p-5 ${isPending ? "border-amber-300" : ""}`}>
      <div className="flex items-start gap-4">
        <ContingentLogo logoUrl={contingent.logoUrl} size={64} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-base leading-tight truncate">{contingent.name}</h2>
                {contingent.shortName && (
                  <span className="text-xs text-zinc-400 font-mono">({contingent.shortName})</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{institution}</p>
            </div>
            {!isPending && (
              <Button size="sm" variant="outline" className="h-7 px-2.5 shrink-0"
                onClick={() => onEdit(contingent)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />{t("editBtn")}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ROLE_COLOR[contingent.managerRole] ?? ""}`}>
              {t(`roleLabel.${contingent.managerRole}` as Parameters<typeof t>[0])}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {t(`typeLabel.${contingent.contingentType}` as Parameters<typeof t>[0])}
            </Badge>
            {isPending && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-300 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />{t("pendingApproval")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {t("pendingApprovalDesc")}
          </p>
        </div>
      ) : (
        <>
          {/* No-state warning for INDEPENDENT / INTERNATIONAL */}
          {(contingent.contingentType === "INDEPENDENT" || contingent.contingentType === "INTERNATIONAL") && !contingent.state && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5">
              <MapPin className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-orange-700">State not set</p>
                <p className="text-[11px] text-orange-600 mt-0.5">
                  You must set a state to participate in zone or state-scoped events. Edit the contingent to add one.
                </p>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">
                <span className="font-semibold">{contingent._count.participants}</span>
                <span className="text-zinc-400 ml-1">{t("participants")}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">
                <span className="font-semibold">{contingent._count.teams}</span>
                <span className="text-zinc-400 ml-1">{t("teams")}</span>
              </span>
            </div>
          </div>

          {/* Other active managers */}
          <ManagersSection managers={contingent.activeManagers} />

          {/* Pending join requests — OWNER only */}
          {contingent.managerRole === "OWNER" && contingent.pendingJoinRequests.length > 0 && (
            <JoinRequestsPanel
              contingentId={contingent.id}
              requests={contingent.pendingJoinRequests}
              onUpdate={onRefresh}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Main ContingentsClient ────────────────────────────────────────────────────

export function ContingentsClient() {
  const t = useTranslations("contingents");
  const [contingents, setContingents] = useState<Contingent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editing, setEditing]         = useState<Contingent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/manager/contingents");
      const j   = await res.json();
      setContingents(j.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function patchContingent(updated: Contingent) {
    setContingents((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (contingents.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center p-8">
        <div className="rounded-full bg-zinc-100 p-5">
          <Users className="h-10 w-10 text-zinc-400" />
        </div>
        <h2 className="text-xl font-semibold">{t("noContingent")}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{t("noContingentDesc")}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{t("subtitle")}</p>
      </div>

      {contingents.map((c) => (
        <ContingentCard key={c.id} contingent={c} onEdit={setEditing} onRefresh={load} />
      ))}

      <EditDialog
        contingent={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => { patchContingent(updated); setEditing(null); }}
      />
    </div>
  );
}
