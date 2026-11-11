/**
 * Walk-in competitions never get certificates (see src/lib/certificates/generator.ts).
 * This finds generator-issued certificates that were made for walk-ins before
 * that rule, and revokes or deletes them.
 *
 *   npx tsx prisma/remove-walkin-certificates.ts            # dry run: list only (default)
 *   npx tsx prisma/remove-walkin-certificates.ts --revoke   # mark REVOKED (reversible; hidden from portals, PDF blocked)
 *   npx tsx prisma/remove-walkin-certificates.ts --delete   # delete the rows permanently
 *
 * A certificate counts as walk-in only if the generator made it (meta.genKey) and:
 *   - participation ("part:" key): no team, and its participant has a CONFIRMED
 *     walk-in registration for that event + competition; or
 *   - winner ("win" key): its teamId is a walk-in registration id (walk-in
 *     results use the registration as the "team").
 * Imported mt25 certificates (no genKey) are never touched.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const mode = process.argv.includes("--delete") ? "delete" : process.argv.includes("--revoke") ? "revoke" : "dry-run";

type Row = {
  id: string; serialNumber: string; status: string; recipientName: string;
  eventName: string | null; competitionCode: string | null; kind: string;
};

async function main() {
  const rows = await db.$queryRaw<Row[]>`
    SELECT c.id, c."serialNumber", c.status::text AS status, c."recipientName", c."eventName", c."competitionCode",
           CASE WHEN c.meta->>'genKey' LIKE '%:part:%' THEN 'participation' ELSE 'winner' END AS kind
    FROM certificates c
    WHERE c.meta ? 'genKey'
      AND (
        (c.meta->>'genKey' LIKE '%:part:%' AND c."teamId" IS NULL AND EXISTS (
          SELECT 1 FROM walkin_registrations wr
          JOIN event_walkin_competitions wc ON wc.id = wr."walkInCompetitionId"
          WHERE wr."participantId" = c."participantId" AND wr.status = 'CONFIRMED'
            AND wc."eventId" = c."eventId" AND wc."competitionId" = c."competitionId"))
        OR
        (c.meta->>'genKey' LIKE '%:win%' AND c."teamId" IN (SELECT id FROM walkin_registrations))
      )
    ORDER BY c."eventName", c."competitionCode", c."recipientName"`;

  const summary = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.eventName ?? "—"} · ${r.competitionCode ?? "—"} · ${r.kind} · ${r.status}`;
    summary.set(k, (summary.get(k) ?? 0) + 1);
  }
  console.log(`Walk-in certificates found: ${rows.length}`);
  for (const [k, n] of summary) console.log(`  ${String(n).padStart(5)}  ${k}`);

  if (mode === "dry-run" || rows.length === 0) {
    console.log(mode === "dry-run" ? "\nDry run — nothing changed. Use --revoke or --delete to apply." : "\nNothing to do.");
    return;
  }

  const ids = rows.map(r => r.id);
  if (mode === "revoke") {
    const { count } = await db.certificate.updateMany({
      where: { id: { in: ids }, status: { not: "REVOKED" } },
      data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Pertandingan walk-in tidak layak sijil" },
    });
    console.log(`\nRevoked ${count} certificates.`);
  } else {
    const { count } = await db.certificate.deleteMany({ where: { id: { in: ids } } });
    console.log(`\nDeleted ${count} certificates.`);
  }
}

main().finally(() => db.$disconnect());
