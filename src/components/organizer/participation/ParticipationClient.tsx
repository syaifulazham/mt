"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Loader2, Building2, Users, User, Trophy,
  GraduationCap, BookOpen, Baby, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type ContingentRow = {
  id: string; name: string; shortName: string | null; contingentType: string; status: string;
  school: { name: string } | null;
  higherInstitution: { name: string } | null;
  state: { name: string } | null;
  _count: { participants: number; teams: number; managers: number };
};
type ManagerRow = {
  id: string; name: string; email: string; phone: string | null;
  school: { name: string } | null;
  higherInstitution: { name: string } | null;
  _count: { contingentManagers: number };
};
type ParticipantRow = {
  id: string; name: string; ic: string | null; gender: string; eduLevel: string; ppki: boolean;
  contingent: { name: string; contingentType: string };
  _count: { teamMembers: number };
};
type TeamRow = {
  id: string; name: string; status: string;
  competition: { code: string; name: string; participationType: string };
  contingent: { name: string };
  _count: { members: number };
};

type Section =
  | { type: "contingents";  total: number; items: ContingentRow[]  }
  | { type: "managers";     total: number; items: ManagerRow[]     }
  | { type: "participants"; total: number; items: ParticipantRow[] }
  | { type: "teams";        total: number; items: TeamRow[]        };

// ── Constants ─────────────────────────────────────────────────────────────────

const EDU_LABEL: Record<string, string> = {
  PRIMARY: "Primary", SECONDARY: "Secondary", YOUTH: "Youth",
};
const EDU_ICON: Record<string, React.ElementType> = {
  PRIMARY: BookOpen, SECONDARY: GraduationCap, YOUTH: Baby,
};
const TYPE_COLORS: Record<string, string> = {
  SCHOOL: "text-sky-600", HIGHER: "text-violet-600",
  INDEPENDENT: "text-amber-600", INTERNATIONAL: "text-rose-600",
};

const SECTION_META: Record<string, { label: string; Icon: React.ElementType }> = {
  contingents:  { label: "Contingents",  Icon: Building2 },
  managers:     { label: "Managers",     Icon: Users     },
  participants: { label: "Participants", Icon: User      },
  teams:        { label: "Teams",        Icon: Trophy    },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ParticipationClient() {
  const router  = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [q,        setQ]        = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounced search
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!q.trim()) { setSections([]); setSearched(false); return; }
    /* eslint-enable react-hooks/set-state-in-effect */
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const types = ["contingents", "managers", "participants", "teams"] as const;
        const results = await Promise.all(
          types.map(type =>
            fetch(`/api/v2/organizer/participation/search?type=${type}&q=${encodeURIComponent(q)}&pageSize=5`)
              .then(r => r.json())
          )
        );
        const built: Section[] = types
          .map((type, i) => ({ type, total: results[i].total ?? 0, items: results[i].data ?? [] }))
          .filter(s => s.total > 0) as Section[];
        setSections(built);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const totalResults = sections.reduce((s, sec) => s + sec.total, 0);
  const hasResults   = searched && !loading;
  const isEmpty      = !q.trim();

  return (
    <div className={cn(
      "max-w-2xl mx-auto px-6 transition-all",
      isEmpty ? "flex flex-col items-center justify-center min-h-[70vh]" : "pt-8 pb-12",
    )}>

      {/* Title — shown prominently when blank */}
      {isEmpty && (
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Participation</h1>
          <p className="text-sm text-zinc-500 mt-2">Search across all registered participants, teams, contingents and managers.</p>
        </div>
      )}

      {/* Search bar */}
      <div className={cn("w-full space-y-1", isEmpty ? "max-w-xl" : "mb-8")}>
        <div className="relative">
          {loading
            ? <Loader2 className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400 animate-spin" />
            : <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
          }
          <Input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search contingents, managers, participants, teams…"
            className="pl-10 h-11 text-sm rounded-full border-zinc-300 shadow-sm focus-visible:ring-1"
            autoFocus
          />
        </div>
        {hasResults && (
          <p className="text-xs text-zinc-400 pl-2">
            {totalResults === 0
              ? `No results for "${q}"`
              : `${totalResults} result${totalResults !== 1 ? "s" : ""} for "${q}"`}
          </p>
        )}
      </div>

      {/* Empty state hints */}
      {isEmpty && (
        <div className="mt-10 grid grid-cols-2 gap-3 w-full max-w-xl">
          {[
            { icon: Building2, label: "Contingents",  hint: "Search by school, name or state" },
            { icon: Users,     label: "Managers",     hint: "Search by name or email"         },
            { icon: User,      label: "Participants", hint: "Search by name or IC number"     },
            { icon: Trophy,    label: "Teams",        hint: "Search by team or competition"   },
          ].map(({ icon: Icon, label, hint }) => (
            <div key={label} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-zinc-100 bg-white shadow-sm">
              <div className="p-1.5 rounded-lg bg-zinc-100 shrink-0">
                <Icon className="h-4 w-4 text-zinc-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-700">{label}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {sections.map(section => {
        const meta = SECTION_META[section.type];
        return (
          <div key={section.type} className="space-y-1">
            {/* Section header */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
              <meta.Icon className="h-3.5 w-3.5" />
              <span className="font-medium uppercase tracking-wide">{meta.label}</span>
              {section.total > 5 && (
                <span className="ml-1">— {section.total} results</span>
              )}
            </div>

            {/* Result rows */}
            {section.type === "contingents" && (section.items as ContingentRow[]).map(c => (
              <ResultCard
                key={c.id}
                breadcrumb={`Participation › Contingents`}
                title={c.name}
                titleSuffix={c.shortName ? `(${c.shortName})` : undefined}
                meta={[
                  (c.school ?? c.higherInstitution)?.name,
                  c.state?.name,
                  `${c._count.participants} participants`,
                  `${c._count.teams} teams`,
                ]}
                tag={c.contingentType}
                tagColor={TYPE_COLORS[c.contingentType]}
                onClick={() => router.push(`/organizer/participation/contingents/${c.id}`)}
              />
            ))}

            {section.type === "managers" && (section.items as ManagerRow[]).map(m => (
              <ResultCard
                key={m.id}
                breadcrumb="Participation › Managers"
                title={m.name}
                meta={[
                  m.email,
                  (m.school ?? m.higherInstitution)?.name,
                  m._count.contingentManagers > 0
                    ? `${m._count.contingentManagers} contingent${m._count.contingentManagers !== 1 ? "s" : ""}`
                    : undefined,
                ]}
                onClick={() => router.push(`/organizer/participation/managers/${m.id}`)}
              />
            ))}

            {section.type === "participants" && (section.items as ParticipantRow[]).map(p => {
              const EduIcon = EDU_ICON[p.eduLevel] ?? User;
              return (
                <ResultCard
                  key={p.id}
                  breadcrumb="Participation › Participants"
                  title={p.name}
                  meta={[
                    p.contingent.name,
                    p.ic,
                    p._count.teamMembers > 0
                      ? `${p._count.teamMembers} team${p._count.teamMembers !== 1 ? "s" : ""}`
                      : undefined,
                  ]}
                  tag={EDU_LABEL[p.eduLevel] ?? p.eduLevel}
                  tagIcon={EduIcon}
                  tagColor={p.eduLevel === "PRIMARY" ? "text-emerald-600" : p.eduLevel === "SECONDARY" ? "text-blue-600" : "text-purple-600"}
                  badge={p.ppki ? "OKU" : undefined}
                  onClick={() => router.push(`/organizer/participation/participants/${p.id}`)}
                />
              );
            })}

            {section.type === "teams" && (section.items as TeamRow[]).map(t => (
              <ResultCard
                key={t.id}
                breadcrumb="Participation › Teams"
                title={t.name}
                meta={[
                  `${t.competition.code} — ${t.competition.name}`,
                  t.contingent.name,
                  `${t._count.members} member${t._count.members !== 1 ? "s" : ""}`,
                ]}
                onClick={() => router.push(`/organizer/participation/teams/${t.id}`)}
              />
            ))}

            {section.total > 5 && (
              <button
                className="text-xs text-[#085782] hover:underline pl-0 mt-1"
                onClick={() => {/* could navigate to a filtered view */}}
              >
                See all {section.total} {meta.label.toLowerCase()} →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Result card ────────────────────────────────────────────────────────────────

function ResultCard({
  breadcrumb, title, titleSuffix, meta, tag, tagIcon: TagIcon, tagColor, badge, onClick,
}: {
  breadcrumb: string;
  title: string;
  titleSuffix?: string;
  meta: (string | undefined | null)[];
  tag?: string;
  tagIcon?: React.ElementType;
  tagColor?: string;
  badge?: string;
  onClick: () => void;
}) {
  const snippet = meta.filter(Boolean).join("  ·  ");
  return (
    <button onClick={onClick}
      className="w-full text-left group py-2.5 px-3 -mx-3 rounded-lg hover:bg-zinc-50 transition-colors">
      <p className="text-[10px] text-zinc-400 mb-0.5">{breadcrumb}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-[#085782] group-hover:underline leading-snug">
          {title}
        </span>
        {titleSuffix && <span className="text-xs text-zinc-400">{titleSuffix}</span>}
        {tag && (
          <span className={cn("flex items-center gap-0.5 text-[10px] font-medium ml-0.5", tagColor ?? "text-zinc-400")}>
            {TagIcon && <TagIcon className="h-3 w-3" />}
            {tag}
          </span>
        )}
        {badge && (
          <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-100 px-1.5 py-0.5 rounded-full font-medium">
            {badge}
          </span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-500 ml-auto shrink-0 transition-colors" />
      </div>
      {snippet && <p className="text-xs text-zinc-500 mt-0.5 truncate">{snippet}</p>}
    </button>
  );
}
