import { db } from "@/lib/db";

type EventLike = {
  id: string;
  scope: string;
  stateId: string | null;
  zoneId:  string | null;
};

/**
 * Filter a list of events to only those that a contingent is location-eligible
 * for, based on the contingent's effectiveStateId and each event's scope.
 *
 * Scope rules:
 *   STATE / ONLINE_STATE   → contingent's stateId must match event's stateId
 *   ZONE  / ONLINE_ZONE    → contingent's stateId must belong to event's zone
 *   NATIONAL / OPEN / ...  → no restriction
 */
export async function filterByLocation<T extends EventLike>(
  events: T[],
  effectiveStateId: string | null,
): Promise<T[]> {
  const STATE_SCOPES = ["STATE", "ONLINE_STATE"];
  const ZONE_SCOPES  = ["ZONE",  "ONLINE_ZONE"];

  const zoneIds = [...new Set(
    events.filter(e => ZONE_SCOPES.includes(e.scope) && e.zoneId).map(e => e.zoneId!),
  )];

  const zoneStates = zoneIds.length > 0
    ? await db.zoneState.findMany({
        where:  { zoneId: { in: zoneIds } },
        select: { zoneId: true, stateId: true },
      })
    : [];

  const zoneStateMap = new Map<string, Set<string>>();
  for (const zs of zoneStates) {
    if (!zoneStateMap.has(zs.zoneId)) zoneStateMap.set(zs.zoneId, new Set());
    zoneStateMap.get(zs.zoneId)!.add(zs.stateId);
  }

  return events.filter((ev) => {
    if (STATE_SCOPES.includes(ev.scope))
      return effectiveStateId != null && ev.stateId === effectiveStateId;
    if (ZONE_SCOPES.includes(ev.scope)) {
      if (!ev.zoneId || effectiveStateId == null) return false;
      return zoneStateMap.get(ev.zoneId)?.has(effectiveStateId) ?? false;
    }
    return true;
  });
}

/**
 * Resolve the effective stateId for a contingent.
 * SCHOOL type: use school.stateId; all other types: use contingent.stateId.
 */
export function resolveEffectiveStateId(contingent: {
  contingentType: string;
  stateId: string | null;
  school?: { stateId: string | null } | null;
}): string | null {
  return contingent.contingentType === "SCHOOL"
    ? (contingent.school?.stateId ?? null)
    : (contingent.stateId ?? null);
}
