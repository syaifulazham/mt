// Client-safe (no db import): shared by lib/announcements.ts and the announcement UIs.

/** Key of an announcement item / mark: kind, competition and scope ("" = national results). */
export const announceKey = (kind: string, refId: string, stateId: string | null | undefined) =>
  `${kind}:${refId}:${stateId ?? ""}`;
