"use client";

import type { ResultsJudging } from "@/components/organizer/judging/JudgingBadge";
import { JudgingStatusTable, applyRowChange } from "@/components/organizer/judging/JudgingStatusPanel";

/**
 * Verification from the results pages (regular and walk-in): the judging
 * table — "Semua" plus each state — through the same judging-status endpoint
 * as the judging pages (rules enforced by transitionJudging). Super Admins get
 * Verify on rows announced SELESAI, and Buka Semula; announcing completion
 * stays on the judging page, so there is no "Selesai" here.
 */
export function ResultsVerification({
  code, name, judging, unit, isSuperAdmin, onChanged,
}: {
  code: string;
  name: string;
  judging: ResultsJudging;
  /** "pasukan" or "peserta". */
  unit: string;
  isSuperAdmin: boolean;
  onChanged: (judging: ResultsJudging) => void;
}) {
  if (!judging.statusUrl || !judging.rows?.length) return null;
  return (
    <div className="border-b">
      <JudgingStatusTable
        code={code}
        name={name}
        rows={judging.rows}
        taskLabels={{}}
        unit={unit}
        statusUrl={judging.statusUrl}
        canWrite={false}
        isSuperAdmin={isSuperAdmin}
        onChanged={(stateId, j) => onChanged({
          ...judging,
          rows: applyRowChange(judging.rows ?? [], stateId, j),
          // The national row is the competition's own status (badge, colours, tab marker).
          ...(stateId === null && {
            status: j.judgingStatus,
            verifiedAt: j.judgingVerifiedAt == null ? null : String(j.judgingVerifiedAt),
            verifiedBy: j.judgingVerifiedBy,
          }),
        })}
      />
    </div>
  );
}
