"use client";

import { useState, useEffect, useRef } from "react";
import {
  Send, Bot, Loader2, Users, UserCheck, BookOpen, Trophy,
  School, CalendarDays, AlertTriangle, Pencil, Trash2, X,
  BookmarkPlus, BookmarkCheck, BookMarked,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ──────────────────────────────────────────────────────────────────────

type Provider = "gemini" | "eptim";

type EptimMeta = {
  epistemic_state?: string;
  consensus_score?: number;
  hallucination_risk?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entity = Record<string, any> & {
  id: string;
  _type: string;
  _action: "SEARCH" | "UPDATE" | "DELETE";
  name: string;
};

type StatBreakdown = { label: string; count: number };

type Stats = {
  count: number;
  label: string;
  breakdown?: StatBreakdown[];
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  entities?: Entity[];
  stats?: Stats;
  total?: number;
  page?: number;
  pageSize?: number;
  queryParams?: Record<string, string>;
  intent?: string;
  action?: string;
  meta?: EptimMeta | null;
  provider?: Provider;
  kbSources?: { title: string; path: string }[];
  error?: boolean;
  paginating?: boolean;
};

type Subject = {
  id: string;
  _type: string;
  name: string;
  subtitle: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

function maskIc(ic: string | null | undefined) {
  if (!ic) return null;
  const d = ic.replace(/\D/g, "");
  return d.length >= 12 ? `${d.slice(0, 6)}-XX-XXXX` : ic;
}

// ── Entity meta ────────────────────────────────────────────────────────────────

const ENTITY_ICON: Record<string, React.ElementType> = {
  participant: Users,
  trainer: UserCheck,
  manager: BookOpen,
  contingent: Trophy,
  school: School,
  team: Users,
  event: CalendarDays,
};

const ENTITY_LABEL_MS: Record<string, string> = {
  participant: "Peserta",
  trainer:     "Jurulatih",
  manager:     "Pengurus",
  contingent:  "Kontingen",
  school:      "Sekolah",
  team:        "Pasukan",
  event:       "Event",
};

function entitySubtitle(e: Entity): string {
  switch (e._type) {
    case "participant": return [maskIc(e.ic), e.contingent?.name, e.eduLevel].filter(Boolean).join(" · ");
    case "trainer":     return [maskIc(e.ic), e.contingent?.name].filter(Boolean).join(" · ");
    case "manager":     return [e.email, e.contingentManagers?.[0]?.contingent?.name].filter(Boolean).join(" · ");
    case "contingent":  return [e.contingentType, e.school?.name ?? e.higherInstitution?.name, e._count?.participants != null ? `${e._count.participants} peserta` : null].filter(Boolean).join(" · ");
    case "school":      return [e.code, e.state?.name, e.level].filter(Boolean).join(" · ");
    case "team":        return [e.competition?.name, e.contingent?.name, e._count?.members != null ? `${e._count.members} ahli` : null].filter(Boolean).join(" · ");
    case "event":       return [e.scope, e.status, e.slug].filter(Boolean).join(" · ");
    default:            return "";
  }
}

// ── Entity Card ────────────────────────────────────────────────────────────────

function EntityCard({
  entity, onClick, onToggleSubject, isSubject,
}: {
  entity: Entity;
  onClick: () => void;
  onToggleSubject?: (e: Entity) => void;
  isSubject?: boolean;
}) {
  const Icon = ENTITY_ICON[entity._type] ?? Users;
  const sub  = entitySubtitle(entity);

  const border = entity._action === "UPDATE"
    ? "border-amber-200 hover:border-amber-300 hover:bg-amber-50/40"
    : entity._action === "DELETE"
    ? "border-red-200 hover:border-red-300 hover:bg-red-50/40"
    : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50";

  const iconBg = entity._action === "UPDATE" ? "bg-amber-50 text-amber-600"
    : entity._action === "DELETE"             ? "bg-red-50 text-red-500"
    : "bg-zinc-100 text-zinc-500";

  return (
    <div className="relative group/card">
      <button
        onClick={onClick}
        className={cn(
          "text-left rounded-xl border bg-white p-3 w-full transition-all shadow-sm hover:shadow",
          border, onToggleSubject && "pr-9",
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className={cn("rounded-lg p-1.5 shrink-0", iconBg)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-sm leading-tight truncate">{entity.name}</span>
              {entity._action === "UPDATE" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">Edit</span>
              )}
              {entity._action === "DELETE" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium shrink-0">Hapus</span>
              )}
            </div>
            {sub && <p className="text-xs text-zinc-400 mt-0.5 truncate">{sub}</p>}
            <p className="text-[10px] text-zinc-300 mt-1">{ENTITY_LABEL_MS[entity._type] ?? entity._type} · klik untuk detail</p>
          </div>
        </div>
      </button>
      {onToggleSubject && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSubject(entity); }}
          title={isSubject ? "Buang dari subjek" : "Jadikan subjek"}
          className={cn(
            "absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-md border transition-all",
            isSubject
              ? "bg-violet-100 border-violet-300 text-violet-600"
              : "bg-white border-zinc-200 text-zinc-300 opacity-0 group-hover/card:opacity-100 hover:border-violet-300 hover:text-violet-500",
          )}
        >
          {isSubject
            ? <BookmarkCheck className="h-3 w-3" />
            : <BookmarkPlus className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

// ── Eptim metadata strip ───────────────────────────────────────────────────────

function EptimStrip({ meta }: { meta: EptimMeta }) {
  const state = meta.epistemic_state ?? "unknown";
  const stateColor = state === "grounded" ? "bg-green-50 text-green-700"
    : state === "uncertain"               ? "bg-amber-50 text-amber-700"
    : "bg-red-50 text-red-600";

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-zinc-100 text-[10px]">
      <span className="text-zinc-400">eptim</span>
      <span className={cn("px-1.5 py-0.5 rounded-full font-medium", stateColor)}>{state}</span>
      {meta.consensus_score != null && (
        <span className="text-zinc-400">{(meta.consensus_score * 100).toFixed(0)}% consensus</span>
      )}
      {(meta.hallucination_risk ?? 0) > 0.3 && (
        <span className="flex items-center gap-0.5 text-amber-500">
          <AlertTriangle className="h-2.5 w-2.5" /> risiko halusinasi tinggi
        </span>
      )}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ stats }: { stats: Stats }) {
  const max = Math.max(...(stats.breakdown?.map(b => b.count) ?? [1]), 1);
  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-violet-700 tabular-nums">
          {stats.count.toLocaleString()}
        </span>
        <span className="text-sm text-violet-500">{stats.label}</span>
      </div>
      {stats.breakdown && stats.breakdown.length > 1 && (
        <div className="space-y-1.5 pt-1">
          {stats.breakdown
            .sort((a, b) => b.count - a.count)
            .map(b => (
              <div key={b.label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-zinc-500">{b.label}</span>
                  <span className="font-medium text-zinc-700 tabular-nums">{b.count.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-violet-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400 rounded-full transition-all"
                    style={{ width: `${(b.count / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Message bubbles ────────────────────────────────────────────────────────────

function UserBubble({ msg }: { msg: ChatMsg }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-violet-600 text-white px-4 py-2.5 text-sm leading-relaxed">
        {msg.content}
      </div>
    </div>
  );
}

function MarkdownReply({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 first:mt-0 text-zinc-700">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-0.5 text-zinc-600">{children}</h3>,
        p:  ({ children }) => <p  className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm leading-snug">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:     ({ children }) => <em className="italic text-zinc-600">{children}</em>,
        code:   ({ children }) => <code className="bg-zinc-100 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
        hr: () => <hr className="my-2 border-zinc-200" />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse border border-zinc-200 rounded">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-zinc-50">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr:    ({ children }) => <tr className="border-b border-zinc-200 last:border-0">{children}</tr>,
        th:    ({ children }) => <th className="px-2 py-1.5 text-left font-semibold text-zinc-600 border-r border-zinc-200 last:border-0">{children}</th>,
        td:    ({ children }) => <td className="px-2 py-1.5 text-zinc-700 border-r border-zinc-200 last:border-0">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function AiBubble({
  msg, onEntityClick, onPageChange, onToggleSubject, subjects,
}: {
  msg: ChatMsg;
  onEntityClick: (e: Entity) => void;
  onPageChange: (msg: ChatMsg, newPage: number) => void;
  onToggleSubject: (e: Entity) => void;
  subjects: Subject[];
}) {
  const hasPagination = msg.total != null && msg.pageSize != null && msg.total > msg.pageSize;
  const currentPage   = msg.page ?? 1;
  const pageSize      = msg.pageSize ?? 10;
  const totalPages    = msg.total ? Math.ceil(msg.total / pageSize) : 1;
  const rangeStart    = (currentPage - 1) * pageSize + 1;
  const rangeEnd      = Math.min(currentPage * pageSize, msg.total ?? 0);

  return (
    <div className="flex gap-3 items-start max-w-[90%]">
      <div className="shrink-0 rounded-full bg-violet-100 p-1.5 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-violet-600" />
      </div>
      <div className="flex-1">
        <div className={cn(
          "rounded-2xl rounded-tl-sm bg-white border px-4 py-3 text-sm leading-relaxed shadow-sm",
          msg.error && "border-red-200 bg-red-50 text-red-700",
        )}>
          <MarkdownReply text={msg.content} />

          {msg.stats && <StatCard stats={msg.stats} />}

          {msg.entities && msg.entities.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {msg.entities.map((e, i) => (
                <EntityCard
                  key={`${e.id}-${i}`} entity={e}
                  onClick={() => onEntityClick(e)}
                  onToggleSubject={onToggleSubject}
                  isSubject={subjects.some(s => s.id === e.id)}
                />
              ))}
            </div>
          )}

          {hasPagination && (
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-100">
              <span className="text-[11px] text-zinc-400">
                {rangeStart}–{rangeEnd} daripada {msg.total}
                {totalPages > 1 && ` (m/s ${currentPage}/${totalPages})`}
              </span>
              <div className="flex items-center gap-1">
                {msg.paginating && <Loader2 className="h-3 w-3 animate-spin text-zinc-400 mr-1" />}
                <button
                  disabled={msg.paginating || currentPage <= 1}
                  onClick={() => onPageChange(msg, currentPage - 1)}
                  className="h-6 w-6 flex items-center justify-center rounded border text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <button
                  disabled={msg.paginating || currentPage >= totalPages}
                  onClick={() => onPageChange(msg, currentPage + 1)}
                  className="h-6 w-6 flex items-center justify-center rounded border text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </div>
          )}

          {msg.provider === "eptim" && msg.meta && <EptimStrip meta={msg.meta} />}

          {msg.kbSources && msg.kbSources.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-100 flex flex-wrap gap-1 items-center">
              <BookMarked className="h-3 w-3 text-emerald-500 shrink-0" />
              {msg.kbSources.map(s => (
                <span
                  key={s.path}
                  title={s.path}
                  className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full"
                >
                  {s.title}
                </span>
              ))}
            </div>
          )}

          {!msg.error && (
            <p className={cn(
              "text-[10px] mt-2",
              msg.provider === "eptim" ? "text-violet-400" : "text-blue-400",
            )}>
              {msg.provider === "eptim" ? "✦ eptim consensus" : "◆ gemini"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 rounded-full bg-violet-100 p-1.5">
        <Bot className="h-3.5 w-3.5 text-violet-600" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-white border px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="block h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Entity Detail Modal ────────────────────────────────────────────────────────

type ModalMode = "view" | "edit" | "delete";

function DL({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="text-sm font-medium mt-0.5 break-words">{value ?? "—"}</dd>
    </div>
  );
}

function ViewBody({ e }: { e: Entity }) {
  switch (e._type) {
    case "participant":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="IC / No. Kad" value={e.ic} />
          <DL label="Jantina" value={e.gender} />
          <DL label="Umur" value={e.age} />
          <DL label="Tahap Pend." value={e.eduLevel} />
          <DL label="Tingkatan/Darjah" value={e.classGrade} />
          <DL label="Kelas" value={e.className} />
          <DL label="Status" value={e.status} />
          <DL label="Kontingen" value={e.contingent?.name} />
          {e.teamMembers?.length > 0 && (
            <div className="col-span-2 space-y-1">
              <dt className="text-xs text-zinc-400">Ahli Pasukan</dt>
              {e.teamMembers.map((tm: Entity) => (
                <dd key={tm.id} className="text-xs bg-zinc-50 rounded px-2 py-1">
                  {tm.team?.name} — {tm.team?.competition?.name}
                </dd>
              ))}
            </div>
          )}
        </dl>
      );
    case "trainer":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="IC / No. Kad" value={e.ic} />
          <DL label="Email" value={e.email} />
          <DL label="No. Telefon" value={e.phoneNumber} />
          <DL label="Status" value={e.status} />
          <DL label="Kontingen" value={e.contingent?.name} />
          {e.teams?.length > 0 && (
            <div className="col-span-2 space-y-1">
              <dt className="text-xs text-zinc-400">Pasukan Dilatih</dt>
              {e.teams.map((tt: Entity) => (
                <dd key={tt.id} className="text-xs bg-zinc-50 rounded px-2 py-1">
                  {tt.team?.name} — {tt.team?.competition?.name}
                </dd>
              ))}
            </div>
          )}
        </dl>
      );
    case "manager":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="Email" value={e.email} />
          <DL label="No. Telefon" value={e.phone} />
          <DL label="IC" value={e.idNumber} />
          <DL label="Institusi" value={e.school?.name ?? e.higherInstitution?.name} />
          {e.contingentManagers?.length > 0 && (
            <div className="col-span-2">
              <dt className="text-xs text-zinc-400 mb-1">Kontingen</dt>
              <div className="flex flex-wrap gap-1">
                {e.contingentManagers.map((cm: Entity) => (
                  <span key={cm.id} className="text-xs bg-zinc-100 rounded px-2 py-0.5">
                    {cm.contingent?.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </dl>
      );
    case "contingent":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="Nama Pendek" value={e.shortName} />
          <DL label="Jenis" value={e.contingentType} />
          <DL label="Institusi" value={e.school?.name ?? e.higherInstitution?.name} />
          <DL label="Status" value={e.status} />
          <DL label="Peserta" value={e._count?.participants} />
          <DL label="Pasukan" value={e._count?.teams} />
          <DL label="Pengurus" value={e._count?.managers} />
          <DL label="Jurulatih" value={e._count?.trainers} />
          {e.managers?.length > 0 && (
            <div className="col-span-2 space-y-1">
              <dt className="text-xs text-zinc-400">Pengurus Aktif</dt>
              {e.managers.map((cm: Entity) => (
                <dd key={cm.id} className="text-xs bg-zinc-50 rounded px-2 py-1">
                  {cm.manager?.name} <span className="text-zinc-400">{cm.manager?.email}</span>
                </dd>
              ))}
            </div>
          )}
        </dl>
      );
    case "school":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="Kod" value={e.code} />
          <DL label="Negeri" value={e.state?.name} />
          <DL label="Zon" value={e.zone?.name} />
          <DL label="Daerah" value={e.district?.name} />
          <DL label="Tahap" value={e.level} />
          <DL label="Kategori" value={e.category} />
          <DL label="Kontingen" value={e._count?.contingents} />
        </dl>
      );
    case "team":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="Pertandingan" value={e.competition?.name} />
          <DL label="Kontingen" value={e.contingent?.name} />
          <DL label="Status" value={e.status} />
          <DL label="Bilangan Ahli" value={e._count?.members} />
          {e.members?.length > 0 && (
            <div className="col-span-2 space-y-1">
              <dt className="text-xs text-zinc-400">Ahli ({e.members.length})</dt>
              {e.members.map((m: Entity) => (
                <dd key={m.id} className="text-xs bg-zinc-50 rounded px-2 py-1 flex justify-between">
                  <span>{m.participant?.name}</span>
                  {m.participant?.gender && <span className="text-zinc-400">{m.participant.gender}</span>}
                </dd>
              ))}
            </div>
          )}
          {e.trainers?.length > 0 && (
            <div className="col-span-2 space-y-1">
              <dt className="text-xs text-zinc-400">Jurulatih</dt>
              {e.trainers.map((tt: Entity) => (
                <dd key={tt.id} className="text-xs bg-zinc-50 rounded px-2 py-1">{tt.trainer?.name}</dd>
              ))}
            </div>
          )}
        </dl>
      );
    case "event":
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DL label="Slug" value={e.slug} />
          <DL label="Skop" value={e.scope} />
          <DL label="Status" value={e.status} />
          <DL label="Negeri / Zon" value={e.state?.name ?? e.zone?.name} />
          <DL label="Tarikh Mula" value={e.startDate ? new Date(e.startDate).toLocaleDateString("ms-MY") : null} />
          <DL label="Tarikh Tamat" value={e.endDate   ? new Date(e.endDate).toLocaleDateString("ms-MY")   : null} />
          <DL label="Pertandingan" value={e._count?.eventCompetitions} />
          {e.eventCompetitions?.length > 0 && (
            <div className="col-span-2 space-y-1">
              <dt className="text-xs text-zinc-400">Senarai Pertandingan</dt>
              {e.eventCompetitions.map((ec: Entity) => (
                <dd key={ec.id} className="text-xs bg-zinc-50 rounded px-2 py-1">
                  {ec.competition?.name} <span className="text-zinc-400 font-mono">{ec.competition?.code}</span>
                </dd>
              ))}
            </div>
          )}
        </dl>
      );
    default:
      return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Object.entries(e)
            .filter(([k]) => !k.startsWith("_") && k !== "id" && typeof e[k] !== "object")
            .map(([k, v]) => <DL key={k} label={k} value={String(v ?? "—")} />)}
        </dl>
      );
  }
}

function EditForm({
  type, form, set,
}: {
  type: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const sel = (k: string, opts: [string, string][], label: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        value={form[k]}
        onChange={e => set(k, e.target.value)}
        className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  if (type === "participant") return (
    <div className="space-y-3">
      <div><Label className="text-xs">Nama</Label>
        <Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
      <div className="grid grid-cols-2 gap-3">
        {sel("gender", [["", "—"], ["MALE", "Lelaki"], ["FEMALE", "Perempuan"]], "Jantina")}
        <div><Label className="text-xs">Umur</Label>
          <Input type="number" value={form.age} onChange={e => set("age", e.target.value)} className="mt-1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sel("eduLevel", [["", "—"], ["PRIMARY", "Rendah"], ["SECONDARY", "Menengah"], ["YOUTH", "Belia"]], "Tahap Pend.")}
        <div><Label className="text-xs">Darjah/Tingkatan</Label>
          <Input value={form.classGrade} onChange={e => set("classGrade", e.target.value)} className="mt-1" /></div>
      </div>
      <div><Label className="text-xs">Nama Kelas</Label>
        <Input value={form.className} onChange={e => set("className", e.target.value)} className="mt-1" /></div>
      {sel("status", [["ACTIVE", "Aktif"], ["INACTIVE", "Tidak Aktif"]], "Status")}
    </div>
  );

  if (type === "trainer") return (
    <div className="space-y-3">
      <div><Label className="text-xs">Nama</Label>
        <Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
      <div><Label className="text-xs">Email</Label>
        <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} className="mt-1" /></div>
      <div><Label className="text-xs">No. Telefon</Label>
        <Input value={form.phoneNumber} onChange={e => set("phoneNumber", e.target.value)} className="mt-1" /></div>
      <div>
        <Label className="text-xs">Status</Label>
        <select value={form.status} onChange={e => set("status", e.target.value)}
          className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Tidak Aktif</option>
        </select>
      </div>
    </div>
  );

  if (type === "contingent") return (
    <div className="space-y-3">
      <div><Label className="text-xs">Nama</Label>
        <Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
      <div><Label className="text-xs">Nama Pendek</Label>
        <Input value={form.shortName} onChange={e => set("shortName", e.target.value)} className="mt-1" /></div>
      <div className="grid grid-cols-2 gap-3">
        {sel("contingentType", [
          ["SCHOOL", "Sekolah"], ["HIGHER", "Institusi Tinggi"],
          ["INDEPENDENT", "Bebas"], ["INTERNATIONAL", "Antarabangsa"],
        ], "Jenis Kontingen")}
        {sel("status", [["ACTIVE", "Aktif"], ["INACTIVE", "Tidak Aktif"], ["SUSPENDED", "Digantung"]], "Status")}
      </div>
    </div>
  );

  return <p className="text-sm text-zinc-400">Kemaskini tidak disokong untuk jenis ini.</p>;
}

function EntityModal({
  entity, onClose, onToggleSubject, isSubject,
}: {
  entity: Entity;
  onClose: () => void;
  onToggleSubject?: (e: Entity) => void;
  isSubject?: boolean;
}) {
  const canEdit   = ["participant", "trainer", "contingent"].includes(entity._type);
  const canDelete = ["participant", "trainer"].includes(entity._type);
  const defaultMode: ModalMode =
    entity._action === "UPDATE" && canEdit   ? "edit"   :
    entity._action === "DELETE" && canDelete ? "delete" : "view";

  const [mode,   setMode]   = useState<ModalMode>(defaultMode);
  const [detail, setDetail] = useState<Entity>(entity);
  const [busy,   setBusy]   = useState(true);
  const [form,   setForm]   = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [delConf, setDelConf] = useState("");
  const [err,    setErr]    = useState("");

  const Icon = ENTITY_ICON[entity._type] ?? Users;

  useEffect(() => {
    fetch(`/api/v2/organizer/smart-chat/entity?type=${entity._type}&id=${entity.id}`)
      .then(r => r.json())
      .then(j => {
        const d = j.data ?? entity;
        setDetail(d);
        setForm({
          name:           d.name           ?? "",
          shortName:      d.shortName      ?? "",
          email:          d.email          ?? "",
          phoneNumber:    d.phoneNumber    ?? "",
          gender:         d.gender         ?? "",
          age:            String(d.age     ?? ""),
          eduLevel:       d.eduLevel       ?? "",
          classGrade:     d.classGrade     ?? "",
          className:      d.className      ?? "",
          contingentType: d.contingentType ?? "",
          status:         d.status         ?? "ACTIVE",
        });
      })
      .catch(() => {
        setDetail(entity);
        setForm({ name: entity.name ?? "", shortName: "", status: entity.status ?? "ACTIVE", email: "", phoneNumber: "", gender: "", age: "", eduLevel: "", classGrade: "", className: "", contingentType: "" });
      })
      .finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id, entity._type]);

  async function save() {
    setSaving(true); setErr("");
    try {
      const body: Record<string, unknown> = { name: form.name || undefined };
      if (entity._type === "participant") Object.assign(body, {
        gender: form.gender || null, age: form.age ? Number(form.age) : null,
        eduLevel: form.eduLevel || null, classGrade: form.classGrade || null,
        className: form.className || null, status: form.status,
      });
      if (entity._type === "trainer") Object.assign(body, {
        email: form.email || null, phoneNumber: form.phoneNumber || null, status: form.status,
      });
      if (entity._type === "contingent") Object.assign(body, {
        shortName:      form.shortName      || null,
        contingentType: form.contingentType || undefined,
        status:         form.status         || undefined,
      });

      const res = await fetch(`/api/v2/organizer/smart-chat/entity?type=${entity._type}&id=${entity.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = await res.json();
      setDetail(prev => ({ ...prev, ...j.data }));
      setMode("view");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  async function del() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/smart-chat/entity?type=${entity._type}&id=${entity.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      onClose();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Gagal memadam."); setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pl-6 pr-14">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-zinc-100 p-2 shrink-0">
              <Icon className="h-4 w-4 text-zinc-600" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base truncate">
                {busy ? "Memuatkan..." : detail.name}
              </DialogTitle>
              <p className="text-xs text-zinc-400">{ENTITY_LABEL_MS[entity._type] ?? entity._type}</p>
            </div>
          </div>
        </DialogHeader>

        {busy ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="px-6 space-y-4 pb-2">

            {/* View */}
            {mode === "view" && (
              <>
                <ViewBody e={detail} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {onToggleSubject && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => onToggleSubject(detail)}
                      className={cn(isSubject && "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100")}
                    >
                      {isSubject
                        ? <><BookmarkCheck className="h-3.5 w-3.5 mr-1.5" /> Subjek Aktif</>
                        : <><BookmarkPlus  className="h-3.5 w-3.5 mr-1.5" /> Jadikan Subjek</>}
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Kemaskini
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="outline" onClick={() => setMode("delete")}
                      className="text-red-600 border-red-200 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Padam
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Edit */}
            {mode === "edit" && (
              <>
                <EditForm type={entity._type} form={form} set={(k, v) => setForm(f => ({ ...f, [k]: v }))} />
                {err && <p className="text-xs text-red-500">{err}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Simpan
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setMode("view"); setErr(""); }}>Batal</Button>
                </div>
              </>
            )}

            {/* Delete */}
            {mode === "delete" && (
              <>
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-1">
                  <p className="text-sm font-medium text-red-700">Padam {ENTITY_LABEL_MS[entity._type]}?</p>
                  <p className="text-xs text-red-600">
                    <strong>{detail.name}</strong> akan dipadam secara kekal. Tindakan ini tidak boleh dibatalkan.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Taip nama untuk sahkan penghapusan:</Label>
                  <Input value={delConf} onChange={e => setDelConf(e.target.value)}
                    placeholder={detail.name} className="mt-1" />
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive"
                    disabled={saving || delConf !== detail.name} onClick={del}>
                    {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Padam
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setMode("view"); setErr(""); setDelConf(""); }}>Batal</Button>
                </div>
              </>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Welcome screen ─────────────────────────────────────────────────────────────

const EXAMPLES = [
  "ada berapa kontingen berdaftar?",
  "berapa peserta lelaki?",
  "cari peserta Ahmad bin Ali",
  "kemaskini peserta 980102143456",
  "remove jurulatih Razif",
  "how many active events?",
];

function Welcome({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 py-10 text-center px-6">
      <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4">
        <Bot className="h-10 w-10 text-violet-500" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Smart Chat</h2>
        <p className="text-sm text-zinc-500 max-w-sm mt-1 leading-relaxed">
          Tanya saya tentang peserta, kontingen, sekolah, pasukan atau event.
          Sokongan Bahasa Melayu dan Inggeris.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full">
        {EXAMPLES.map(s => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="text-xs text-left bg-zinc-50 border rounded-xl px-3 py-2.5 font-mono text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function SmartChatClient({ role }: { role: OrganizerRole }) {
  const [messages,  setMessages]  = useState<ChatMsg[]>([]);
  const [input,     setInput]     = useState("");
  const [sending,   setSending]   = useState(false);
  const [provider,  setProvider]  = useState<Provider>("gemini");
  const [modal,     setModal]     = useState<Entity | null>(null);
  const [subjects,  setSubjects]  = useState<Subject[]>([]);

  function toggleSubject(entity: Entity) {
    setSubjects(prev => {
      const exists = prev.some(s => s.id === entity.id);
      if (exists) return prev.filter(s => s.id !== entity.id);
      return [...prev, {
        id:       entity.id,
        _type:    entity._type,
        name:     entity.name,
        subtitle: entitySubtitle(entity),
      }];
    });
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function fetchPage(msgId: string, intent: string, queryParams: Record<string, string>, newPage: number) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, paginating: true } : m));
    try {
      const sp = new URLSearchParams({ intent, page: String(newPage), pageSize: "10", ...queryParams });
      const res = await fetch(`/api/v2/organizer/smart-chat?${sp}`);
      if (!res.ok) return;
      const j = await res.json();
      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, entities: j.entities, page: j.page, total: j.total, pageSize: j.pageSize, paginating: false }
          : m
      ));
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, paginating: false } : m));
    }
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    const userMsg: ChatMsg = { id: uid(), role: "user", content: msg };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      // Build API messages: inject subject context into the last user message only
      const subjectCtx = subjects.length > 0
        ? `[Subjek aktif: ${subjects.map(s => `${ENTITY_LABEL_MS[s._type] ?? s._type} "${s.name}" (id:${s.id})`).join(' | ')}]\n`
        : "";
      const apiMessages = next.map((m, i) =>
        i === next.length - 1 && m.role === "user"
          ? { role: m.role, content: subjectCtx + m.content }
          : { role: m.role, content: m.content }
      );

      const res = await fetch("/api/v2/organizer/smart-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          provider,
          subjects: subjects.map(s => ({ id: s.id, _type: s._type, name: s.name })),
        }),
      });

      const j = await res.json();

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: uid(), role: "assistant",
          content: j.detail ?? "Maaf, berlaku ralat. Sila cuba lagi.",
          error: true, provider,
        }]);
        return;
      }

      setMessages(prev => [...prev, {
        id: uid(), role: "assistant",
        content: j.reply ?? "...",
        entities: j.entities ?? [],
        stats: j.stats ?? undefined,
        total: j.total, page: j.page, pageSize: j.pageSize,
        queryParams: j.queryParams,
        intent: j.intent, action: j.action,
        meta: j.meta, provider,
        kbSources: j.kbSources?.length ? j.kbSources : undefined,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: uid(), role: "assistant",
        content: "Sambungan gagal. Semak rangkaian anda.",
        error: true, provider,
      }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <Bot className="h-5 w-5 text-violet-500" />
          <span className="font-semibold text-sm">Smart Chat</span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 ml-1"
            >
              <X className="h-3 w-3" /> Bersih
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-0.5">
          {(["gemini", "eptim"] as Provider[]).map(p => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-all",
                provider === p ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              {p === "eptim" ? "✦ Eptim" : "◆ Gemini"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-zinc-50/50">
        {messages.length === 0
          ? <Welcome onSuggest={s => { setInput(s); send(s); }} />
          : messages.map(m =>
              m.role === "user"
                ? <UserBubble key={m.id} msg={m} />
                : <AiBubble
              key={m.id} msg={m} onEntityClick={setModal}
              onToggleSubject={toggleSubject}
              subjects={subjects}
              onPageChange={(msg, p) =>
                msg.intent && msg.queryParams
                  ? fetchPage(msg.id, msg.intent, msg.queryParams, p)
                  : undefined
              }
            />
            )
        }
        {sending && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* ── Subject tray ────────────────────────────────────────────── */}
      {subjects.length > 0 && (
        <div className="shrink-0 border-t bg-white px-4 py-2 flex items-start gap-2">
          <span className="text-[10px] text-zinc-400 mt-1.5 shrink-0">Subjek:</span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {subjects.map(sub => {
              const Icon = ENTITY_ICON[sub._type] ?? Users;
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg pl-2 pr-1 py-1 text-xs max-w-[200px]"
                >
                  <Icon className="h-3 w-3 text-violet-400 shrink-0" />
                  <span className="font-medium text-violet-800 truncate">{sub.name}</span>
                  <span className="text-violet-400 shrink-0">{ENTITY_LABEL_MS[sub._type]}</span>
                  <button
                    onClick={() => setSubjects(prev => prev.filter(s => s.id !== sub.id))}
                    className="shrink-0 h-4 w-4 flex items-center justify-center rounded hover:bg-violet-200 text-violet-400 hover:text-violet-700 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Input bar ───────────────────────────────────────────────── */}
      <div className="shrink-0 border-t bg-white px-4 py-3">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <Input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Taip mesej… (cth: cari peserta Ahmad, kemaskini 980102143456)"
            disabled={sending}
            className="rounded-xl border-zinc-200 focus-visible:ring-violet-400"
          />
          <Button
            onClick={() => send()}
            disabled={!input.trim() || sending}
            className="rounded-xl bg-violet-600 hover:bg-violet-700 shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-center text-[10px] text-zinc-300 mt-1.5">
          {provider === "eptim" ? "✦ eptim-core multi-model consensus" : "◆ Google Gemini 2.5 Flash"}
        </p>
      </div>

      {/* ── Modal ───────────────────────────────────────────────────── */}
      {modal && (
        <EntityModal
          entity={modal}
          onClose={() => setModal(null)}
          onToggleSubject={toggleSubject}
          isSubject={subjects.some(s => s.id === modal.id)}
        />
      )}
    </div>
  );
}
