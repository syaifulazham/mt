import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Bulk ZIP download of a generator job's certificates: what to include
// (search, states, target groups, competitions), how PDFs are grouped inside a
// ZIP (`format`), and whether the download is split into several ZIPs
// (`chunkBy`). The plan endpoint counts with this; the download endpoint
// streams one chunk. Nothing is written to disk — PDFs are rendered on demand.
//
// A certificate row carries no target group (see the archival contract), so it
// is looked up from the row's competition (by its soft `competitionId`, else
// its code); certificates whose competition is gone fall under "Lain-lain".

export const FORMATS = ["single", "competition", "state", "contingent"] as const;
export type ZipFormat = (typeof FORMATS)[number];
export const CHUNKS = ["none", "state", "contingent", "competition", "targetGroup"] as const;
export type ChunkBy = (typeof CHUNKS)[number];

/**
 * Order of the certificates — the pages inside a multi-page PDF and the files
 * of a ZIP — chosen for what the download is for:
 *   competition — competition, state, rank, contingent (results order; the default)
 *   contingent  — state, contingent, competition, rank, name (printed stacks handed out per school)
 *   name        — recipient name A–Z (finding / sending a person's own certificate)
 *   serial      — serial number (a complete record, in issue order)
 */
export const SORTS = ["competition", "contingent", "name", "serial"] as const;
export type CertSort = (typeof SORTS)[number];

type SortableCert = {
  competitionCode: string | null; stateName: string | null; contingentName: string | null;
  recipientName: string; rank: number | null; serialNumber: string;
};

const cmpText = (a: string | null, b: string | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Compares two certificates in the given order (ties fall back to the serial). */
export function compareCerts(sort: CertSort, a: SortableCert, b: SortableCert): number {
  const rank = (a.rank ?? 1e9) - (b.rank ?? 1e9);
  const serial = a.serialNumber.localeCompare(b.serialNumber, undefined, { numeric: true });
  switch (sort) {
    case "contingent":
      return cmpText(a.stateName, b.stateName) || cmpText(a.contingentName, b.contingentName)
        || cmpText(a.competitionCode, b.competitionCode) || rank || cmpText(a.recipientName, b.recipientName) || serial;
    case "name":
      return cmpText(a.recipientName, b.recipientName) || cmpText(a.competitionCode, b.competitionCode) || serial;
    case "serial":
      return serial;
    default:
      return cmpText(a.competitionCode, b.competitionCode) || cmpText(a.stateName, b.stateName)
        || rank || cmpText(a.contingentName, b.contingentName) || serial;
  }
}

export type DownloadFilters = { q: string; states: string[]; targetGroups: string[]; competitions: string[] };

export const NO_STATE = "Tanpa negeri", NO_CONTINGENT = "Tanpa kontinjen", NO_COMPETITION = "Tanpa pertandingan", NO_GROUP = "Lain-lain";

const list = (v: string | null) => (v ? v.split("|").map(s => s.trim()).filter(Boolean) : []);

export function parseDownloadParams(sp: URLSearchParams) {
  const format = (FORMATS as readonly string[]).includes(sp.get("format") ?? "") ? sp.get("format") as ZipFormat : "single";
  const chunkBy = (CHUNKS as readonly string[]).includes(sp.get("chunkBy") ?? "") ? sp.get("chunkBy") as ChunkBy : "none";
  const filters: DownloadFilters = {
    q: sp.get("q")?.trim() ?? "", states: list(sp.get("states")), targetGroups: list(sp.get("targetGroups")), competitions: list(sp.get("competitions")),
  };
  const sort = (SORTS as readonly string[]).includes(sp.get("sort") ?? "") ? sp.get("sort") as CertSort : "competition";
  return { format, chunkBy, sort, filters, chunk: sp.get("chunk"), token: sp.get("token") };
}

/** The job's certificates that may be downloaded (not revoked), narrowed by the search text. */
export function jobWhere(jobId: string, q: string): Prisma.CertificateWhereInput {
  return {
    meta: { path: ["jobId"], equals: jobId },
    status: { not: "REVOKED" }, revokedAt: null,
    ...(q && {
      OR: [
        { recipientName:   { contains: q, mode: "insensitive" } },
        { recipientIc:     { contains: q } },
        { serialNumber:    { contains: q, mode: "insensitive" } },
        { contingentName:  { contains: q, mode: "insensitive" } },
        { competitionCode: { contains: q, mode: "insensitive" } },
        { competitionName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
}

export type CertKey = {
  id: string; stateName: string | null; contingentName: string | null;
  competitionCode: string | null; competitionName: string | null; competitionId: string | null;
};
export type Keyed = CertKey & { state: string; contingent: string; competition: string; targetGroup: string };

/** Target group label of each competition the certificates name (by id, else by code). */
async function targetGroupLookup(rows: CertKey[]) {
  const ids = [...new Set(rows.map(r => r.competitionId).filter((x): x is string => !!x))];
  const codes = [...new Set(rows.map(r => r.competitionCode).filter((x): x is string => !!x))];
  const comps = ids.length || codes.length ? await db.competition.findMany({
    where: { OR: [{ id: { in: ids } }, { code: { in: codes } }] },
    select: { id: true, code: true, targetGroups: { select: { targetGroup: { select: { name: true } } } } },
  }) : [];
  const label = (c: (typeof comps)[number]) => c.targetGroups.map(t => t.targetGroup.name).sort().join(" / ") || NO_GROUP;
  const byId = new Map(comps.map(c => [c.id, label(c)]));
  const byCode = new Map<string, string>();
  for (const c of comps) if (!byCode.has(c.code)) byCode.set(c.code, label(c));
  return (r: CertKey) => (r.competitionId && byId.get(r.competitionId)) || (r.competitionCode && byCode.get(r.competitionCode)) || NO_GROUP;
}

/** The job's downloadable certificates (search applied), each with its filter / chunk keys. */
export async function loadKeyed(jobId: string, q: string): Promise<Keyed[]> {
  const rows = await db.certificate.findMany({
    where: jobWhere(jobId, q),
    select: { id: true, stateName: true, contingentName: true, competitionCode: true, competitionName: true, competitionId: true },
  });
  const groupOf = await targetGroupLookup(rows);
  return rows.map(r => ({
    ...r,
    state: r.stateName || NO_STATE,
    contingent: r.contingentName || NO_CONTINGENT,
    competition: r.competitionCode ? `${r.competitionCode} ${r.competitionName ?? ""}`.trim() : NO_COMPETITION,
    targetGroup: groupOf(r),
  }));
}

export function applyFilters(rows: Keyed[], f: DownloadFilters): Keyed[] {
  const st = new Set(f.states), tg = new Set(f.targetGroups), cp = new Set(f.competitions);
  return rows.filter(r => (!st.size || st.has(r.state)) && (!tg.size || tg.has(r.targetGroup)) && (!cp.size || cp.has(r.competition)));
}

/** The ZIP a certificate goes into for a split (contingents are kept apart per state). */
export const chunkKeyOf = (r: Keyed, by: ChunkBy): string =>
  by === "state" ? r.state : by === "contingent" ? `${r.state} — ${r.contingent}` : by === "competition" ? r.competition
  : by === "targetGroup" ? r.targetGroup : "";

/** PDFs a set of certificates becomes for a format (template versions aside). */
export function fileCount(rows: Keyed[], format: ZipFormat): number {
  if (format === "single") return rows.length;
  const key = (r: Keyed) => (format === "competition" ? r.competition : format === "state" ? r.state : `${r.state}/${r.contingent}`);
  return new Set(rows.map(key)).size;
}

const counts = (rows: Keyed[], key: (r: Keyed) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].map(([name, certs]) => ({ name, certs })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

/** What a download would produce: totals, the ZIPs of the split, and the values each filter offers. */
export function planOf(all: Keyed[], filters: DownloadFilters, format: ZipFormat, chunkBy: ChunkBy) {
  const rows = applyFilters(all, filters);
  const chunks = chunkBy === "none"
    ? [{ key: "", label: "Semua", certs: rows.length, files: fileCount(rows, format) }]
    : counts(rows, r => chunkKeyOf(r, chunkBy)).map(c => ({
        key: c.name, label: c.name, certs: c.certs, files: fileCount(rows.filter(r => chunkKeyOf(r, chunkBy) === c.name), format),
      }));
  return {
    total: rows.length,
    files: chunks.reduce((a, c) => a + c.files, 0),
    chunks: rows.length ? chunks : [],
    // Facets are over the whole job (search applied), so a filter can always be widened again.
    facets: {
      states: counts(all, r => r.state),
      targetGroups: counts(all, r => r.targetGroup),
      competitions: counts(all, r => r.competition),
      contingents: new Set(all.map(r => `${r.state}/${r.contingent}`)).size,
    },
  };
}

// ── Progress ─────────────────────────────────────────────────────────────────
// One entry per running download, keyed by a token the page makes up; the page
// polls it. In memory: the app is a single container, and an entry only
// matters for the minutes its download runs.

export type DownloadProgress = { done: number; total: number; certs: number; finished: boolean; error: string | null; at: number };
const store = (globalThis as { __certDownloadProgress?: Map<string, DownloadProgress> }).__certDownloadProgress ??= new Map();

export function setProgress(token: string | null, patch: Partial<DownloadProgress>) {
  if (!token) return;
  const now = Date.now();
  for (const [k, v] of store) if (now - v.at > 30 * 60_000) store.delete(k);
  store.set(token, { done: 0, total: 0, certs: 0, finished: false, error: null, ...store.get(token), ...patch, at: now });
}
export const getProgress = (token: string) => store.get(token) ?? null;
