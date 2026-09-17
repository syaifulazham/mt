/**
 * One-time migration: MySQL `mtdb` certificates → PostgreSQL certificate module.
 *
 * Run:  npx tsx prisma/migrate-certificates.ts [options]
 *
 *   --source-env=PATH   .env holding the MySQL DATABASE_URL (default ../mt25/.env)
 *   --assets-dir=PATH   where mt25's public/ lives (default ../mt25/public)
 *   --batch=N           certificate insert batch size (default 2000)
 *   --skip-assets       don't upload base PDFs to R2 (reuses whatever is recorded)
 *   --dry-run           read, map and verify counts; write nothing
 *
 * Re-runnable by design: certificates are inserted with `skipDuplicates` on the
 * unique `legacyCertId`, so a failed batch can simply be replayed.
 *
 * Follows the precedent of prisma/migrate-schools.ts (mysql2 in, Prisma out) and
 * is deliberately NOT part of the migration history: 117 k rows are data, not
 * schema.
 */

import { readFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import mysql from "mysql2/promise";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  CertAssetType, CertRecipientType, CertStatus, CertTargetType, CertTemplateStatus, PrismaClient, Prisma,
} from "@prisma/client";
import { parseConfig, type UpgradeReport } from "../src/lib/certificates/config-schema";
import { parseSerial } from "../src/lib/certificates/serial";

// ── options ──────────────────────────────────────────────────────────────────

const arg = (name: string, fallback?: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const flag = (name: string) => process.argv.includes(`--${name}`);

const SOURCE_ENV  = arg("source-env",  path.resolve(__dirname, "../../mt25/.env"))!;
const ASSETS_DIR  = arg("assets-dir",  path.resolve(__dirname, "../../mt25/public"))!;
const BATCH       = Number(arg("batch", "2000"));
const SKIP_ASSETS = flag("skip-assets");
const DRY_RUN     = flag("dry-run");

const pg = new PrismaClient();

/** The script runs outside Next, so .env is not loaded for us. */
async function loadEnvFile(file: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const text = await readFile(file, "utf8");
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// ── seasons ──────────────────────────────────────────────────────────────────

/**
 * `MT26-LEGACY` exists because the 794 certificates mt25 issued in January 2026
 * belong to the 2026 edition but were never produced by this app: keeping them in
 * their own season row means "regenerate from live data" can be withheld for them
 * while the live MT26 season stays issuable. Both share the printed prefix
 * `MT26`, so the live season's counters are seeded past the imported maximum
 * (see seedSerialCounters) — `serialNumber` is globally unique.
 */
const SEASONS = [
  { code: "MT25",        serialPrefix: "MT25", year: 2025, name: "Malaysia Techlympics 2025",             isCurrent: false, archived: true  },
  { code: "MT26-LEGACY", serialPrefix: "MT26", year: 2026, name: "Malaysia Techlympics 2026 (import mt25)", isCurrent: false, archived: true  },
  { code: "MT26",        serialPrefix: "MT26", year: 2026, name: "Malaysia Techlympics 2026",             isCurrent: true,  archived: false },
] as const;

const SEASON_BY_PREFIX: Record<string, string> = { MT25: "MT25", MT26: "MT26-LEGACY" };

const TARGET_TYPE: Record<string, CertTargetType> = {
  GENERAL:                 CertTargetType.GENERAL,
  EVENT_PARTICIPANT:       CertTargetType.EVENT_PARTICIPANT,
  EVENT_WINNER:            CertTargetType.EVENT_WINNER,
  NON_CONTEST_PARTICIPANT: CertTargetType.NON_CONTEST_PARTICIPANT,
  QUIZ_PARTICIPANT:        CertTargetType.QUIZ_PARTICIPANT,
  QUIZ_WINNER:             CertTargetType.QUIZ_WINNER,
  TRAINERS:                CertTargetType.TRAINER,   // renamed
  CONTINGENT:              CertTargetType.CONTINGENT,
  SCHOOL_WINNER:           CertTargetType.SCHOOL_WINNER,
};

/** `recipientType` was free text; `WINNER` describes the award, not the recipient. */
const RECIPIENT_TYPE: Record<string, CertRecipientType> = {
  PARTICIPANT: CertRecipientType.PARTICIPANT,
  contestant:  CertRecipientType.PARTICIPANT,
  WINNER:      CertRecipientType.PARTICIPANT,
  TRAINER:     CertRecipientType.TRAINER,
  CONTINGENT:  CertRecipientType.CONTINGENT,
};

/**
 * mt25's renderer stripped the word "contingent" from the name at draw time, so
 * the printed certificate never showed it. The snapshot stores what was printed;
 * the raw value is kept in `meta` when the two differ.
 */
function cleanContingentName(name: string): string {
  return name.replace(/\bcontingent\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

type MySqlTemplate = {
  id: number; templateName: string; targetType: string; basePdfPath: string;
  status: string; configuration: unknown;
};

type MySqlCertificate = {
  id: number; templateId: number; recipientName: string; recipientEmail: string | null;
  recipientType: string | null; contingent_name: string | null; team_name: string | null;
  ic_number: string | null; contestName: string | null; awardTitle: string | null;
  uniqueCode: string; serialNumber: string; status: string | null;
  issuedAt: Date | null; createdAt: Date | null; ownership: { year?: number; contestantId?: number; contingentId?: number } | null;
};

async function main() {
  // Outside Next nothing reads this app's .env, and the R2 upload needs it.
  for (const [k, v] of Object.entries(await loadEnvFile(path.resolve(__dirname, "../.env")).catch(() => ({}))))
    process.env[k] ??= v;

  const sourceEnv = await loadEnvFile(SOURCE_ENV);
  const sourceUrl = new URL(sourceEnv.DATABASE_URL);
  const my = await mysql.createConnection({
    host:     sourceUrl.hostname,
    port:     Number(sourceUrl.port) || 3306,
    user:     decodeURIComponent(sourceUrl.username),
    password: decodeURIComponent(sourceUrl.password),
    database: sourceUrl.pathname.slice(1),
  });
  console.log(`source: mysql://${sourceUrl.hostname}/${sourceUrl.pathname.slice(1)}   dry-run: ${DRY_RUN}`);

  // ── 0. pre-flight: every certificate must have a template and a parseable serial
  const [orphanRows] = await my.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) n FROM certificate c LEFT JOIN cert_template t ON t.id = c.templateId WHERE t.id IS NULL`,
  );
  const orphans = Number(orphanRows[0].n);
  if (orphans > 0) throw new Error(`${orphans} certificates reference a missing template — aborting`);

  // ── 1. seasons
  const seasonIds = new Map<string, string>();
  for (const s of SEASONS) {
    if (DRY_RUN) { seasonIds.set(s.code, `dry-${s.code}`); continue; }
    const row = await pg.season.upsert({
      where:  { code: s.code },
      create: {
        code: s.code, serialPrefix: s.serialPrefix, year: s.year, name: s.name,
        isCurrent: s.isCurrent, archivedAt: s.archived ? new Date() : null,
      },
      update: { serialPrefix: s.serialPrefix, year: s.year, name: s.name },
    });
    seasonIds.set(s.code, row.id);
  }
  console.log(`seasons: ${SEASONS.map((s) => s.code).join(", ")}`);

  // ── 2. base assets → R2 (content-addressed, so re-runs are no-ops)
  const [assetRows] = await my.query<mysql.RowDataPacket[]>(`SELECT DISTINCT basePdfPath FROM cert_template`);
  const assetUrlByPath = new Map<string, string>();
  const publicBase = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const r2 = SKIP_ASSETS || DRY_RUN ? null : new S3Client({
    region:   "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  for (const { basePdfPath } of assetRows as { basePdfPath: string }[]) {
    const local = path.join(ASSETS_DIR, basePdfPath.replace(/^\//, ""));
    const bytes = await readFile(local).catch(() => null);
    if (!bytes) { console.warn(`  ! missing base asset on disk: ${local}`); continue; }
    const key = `cert-templates/${createHash("sha1").update(bytes).digest("hex")}.pdf`;
    if (r2) {
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: bytes, ContentType: "application/pdf",
      }));
    }
    assetUrlByPath.set(basePdfPath, `${publicBase}/${key}`);
    console.log(`  asset ${(bytes.length / 1e6).toFixed(1)} MB → ${key}${r2 ? "" : " (not uploaded)"}`);
  }

  // ── 3. which season owns each template (majority of its certificates)
  const [tplSeasonRows] = await my.query<mysql.RowDataPacket[]>(
    `SELECT templateId, SUBSTRING_INDEX(serialNumber,'/',1) prefix, COUNT(*) n
     FROM certificate GROUP BY templateId, prefix`,
  );
  const templatePrefix = new Map<number, { prefix: string; n: number }>();
  for (const r of tplSeasonRows as { templateId: number; prefix: string; n: number }[]) {
    const best = templatePrefix.get(r.templateId);
    if (!best || Number(r.n) > best.n) templatePrefix.set(r.templateId, { prefix: r.prefix, n: Number(r.n) });
  }

  // ── 4. templates + immutable version 1
  const [templates] = await my.query<mysql.RowDataPacket[]>(
    `SELECT id, templateName, targetType, basePdfPath, status, configuration FROM cert_template ORDER BY id`,
  );
  const versionIdByTemplate = new Map<number, string>();
  const upgradeReport: UpgradeReport = { dropped: [] };
  let templatesWritten = 0;

  for (const t of templates as MySqlTemplate[]) {
    const targetType = TARGET_TYPE[t.targetType];
    if (!targetType) throw new Error(`template ${t.id}: unmapped targetType ${t.targetType}`);

    const config = parseConfig(
      typeof t.configuration === "string" ? JSON.parse(t.configuration) : t.configuration,
      upgradeReport,
    );
    const baseAssetUrl = assetUrlByPath.get(t.basePdfPath);
    if (!baseAssetUrl) throw new Error(`template ${t.id}: no migrated base asset for ${t.basePdfPath}`);

    const seasonCode = SEASON_BY_PREFIX[templatePrefix.get(t.id)?.prefix ?? "MT25"] ?? "MT25";
    const seasonId   = seasonIds.get(seasonCode)!;
    const name       = `[${t.id}] ${t.templateName}`.slice(0, 200);

    if (DRY_RUN) { versionIdByTemplate.set(t.id, `dry-v1-${t.id}`); continue; }

    // Idempotent on (seasonId, name): re-running must not fork a second template.
    const existing = await pg.certTemplate.findFirst({ where: { seasonId, name }, include: { versions: true } });
    const template = existing ?? await pg.certTemplate.create({
      data: {
        seasonId, name, targetType,
        status:        t.status === "ACTIVE" ? CertTemplateStatus.ACTIVE : CertTemplateStatus.ARCHIVED,
        draftConfig:   config as unknown as Prisma.InputJsonValue,
        baseAssetUrl,  baseAssetType: CertAssetType.PDF,
        createdBy:     "mt25-import",
      },
    });

    const version = existing?.versions.find((v) => v.version === 1) ?? await pg.certTemplateVersion.create({
      data: {
        templateId: template.id, version: 1, baseAssetUrl, baseAssetType: CertAssetType.PDF,
        configuration: config as unknown as Prisma.InputJsonValue, publishedBy: "mt25-import",
      },
    });
    if (!template.currentVersionId)
      await pg.certTemplate.update({ where: { id: template.id }, data: { currentVersionId: version.id } });

    versionIdByTemplate.set(t.id, version.id);
    templatesWritten++;
  }
  console.log(`templates: ${templates.length} read, ${templatesWritten} written, ${upgradeReport.dropped.length} elements dropped`);
  for (const d of upgradeReport.dropped.slice(0, 10)) console.warn(`  ! dropped: ${d.reason}`);

  // ── 5. serial counters — before certificates, so new issues cannot collide
  const [maxRows] = await my.query<mysql.RowDataPacket[]>(
    `SELECT SUBSTRING_INDEX(serialNumber,'/',1) prefix,
            SUBSTRING_INDEX(SUBSTRING_INDEX(serialNumber,'/',2),'/',-1) typeCode,
            MAX(CAST(SUBSTRING_INDEX(serialNumber,'/',-1) AS UNSIGNED)) maxSeq
     FROM certificate GROUP BY prefix, typeCode`,
  );
  for (const r of maxRows as { prefix: string; typeCode: string; maxSeq: number }[]) {
    // The imported season keeps its own high-water mark for the record; the live
    // season sharing the prefix gets seeded so its next serial continues the line.
    const targets = [SEASON_BY_PREFIX[r.prefix], ...SEASONS.filter((s) => s.serialPrefix === r.prefix && !s.archived).map((s) => s.code)];
    for (const code of new Set(targets.filter(Boolean))) {
      const seasonId = seasonIds.get(code)!;
      if (DRY_RUN) continue;
      const current = await pg.certSerialCounter.findUnique({ where: { seasonId_typeCode: { seasonId, typeCode: r.typeCode } } });
      if (current && current.lastSequence >= Number(r.maxSeq)) continue;
      await pg.certSerialCounter.upsert({
        where:  { seasonId_typeCode: { seasonId, typeCode: r.typeCode } },
        create: { seasonId, typeCode: r.typeCode, lastSequence: Number(r.maxSeq) },
        update: { lastSequence: Number(r.maxSeq) },
      });
    }
  }
  console.log(`serial counters seeded for ${maxRows.length} (prefix, typeCode) pairs`);

  // ── 6. certificates
  const [totalRows] = await my.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) total FROM certificate`);
  const total = Number(totalRows[0].total);
  let imported = 0, skipped = 0, lastId = 0;

  for (;;) {
    const [rows] = await my.query<mysql.RowDataPacket[]>(
      `SELECT id, templateId, recipientName, recipientEmail, recipientType, contingent_name, team_name,
              ic_number, contestName, awardTitle, uniqueCode, serialNumber, status, issuedAt, createdAt, ownership
       FROM certificate WHERE id > ? ORDER BY id LIMIT ?`,
      [lastId, BATCH],
    );
    const batch = rows as MySqlCertificate[];
    if (!batch.length) break;
    lastId = batch[batch.length - 1].id;

    const data: Prisma.CertificateCreateManyInput[] = [];
    for (const c of batch) {
      const serial = parseSerial(c.serialNumber);
      if (!serial) { console.warn(`  ! unparseable serial ${c.serialNumber} (cert ${c.id})`); skipped++; continue; }

      const seasonCode = SEASON_BY_PREFIX[serial.prefix];
      const seasonId   = seasonCode && seasonIds.get(seasonCode);
      if (!seasonId) { console.warn(`  ! no season for prefix ${serial.prefix} (cert ${c.id})`); skipped++; continue; }

      const templateVersionId = versionIdByTemplate.get(c.templateId);
      if (!templateVersionId) { console.warn(`  ! no template version for ${c.templateId} (cert ${c.id})`); skipped++; continue; }

      const rawContingent = c.contingent_name ?? null;
      const contingentName = rawContingent ? cleanContingentName(rawContingent) : null;
      const meta: Record<string, unknown> = {};
      if (rawContingent && rawContingent !== contingentName) meta.sourceContingentName = rawContingent;
      if (serial.templateSegment) meta.legacySerialTemplateSegment = serial.templateSegment;
      if (c.ownership?.year) meta.legacyOwnershipYear = c.ownership.year;

      data.push({
        seasonId, templateVersionId,
        serialNumber:   c.serialNumber,
        uniqueCode:     c.uniqueCode,
        status:         c.status === "LISTED" ? CertStatus.LISTED : CertStatus.READY,
        issuedAt:       c.issuedAt ?? c.createdAt,
        recipientName:  c.recipientName,
        recipientType:  RECIPIENT_TYPE[c.recipientType ?? ""] ?? CertRecipientType.OTHER,
        recipientIc:    c.ic_number,
        recipientEmail: c.recipientEmail,
        contingentName,
        teamName:        c.team_name,
        competitionName: c.contestName,
        awardTitle:      c.awardTitle,
        meta:            Object.keys(meta).length ? (meta as Prisma.InputJsonValue) : undefined,
        legacyCertId:        c.id,
        legacyParticipantId: c.ownership?.contestantId ?? null,
        legacyContingentId:  c.ownership?.contingentId ?? null,
        createdAt:           c.createdAt ?? undefined,
      });
    }

    if (!DRY_RUN && data.length) {
      const res = await pg.certificate.createMany({ data, skipDuplicates: true });
      imported += res.count;
    } else {
      imported += data.length;
    }
    process.stdout.write(`\r  certificates: ${imported}/${total}${skipped ? ` (${skipped} skipped)` : ""}   `);
  }
  console.log();

  // ── 7. verification
  const [srcPairs] = await my.query<mysql.RowDataPacket[]>(
    `SELECT SUBSTRING_INDEX(serialNumber,'/',1) prefix,
            SUBSTRING_INDEX(SUBSTRING_INDEX(serialNumber,'/',2),'/',-1) typeCode, COUNT(*) n
     FROM certificate GROUP BY prefix, typeCode ORDER BY prefix, typeCode`,
  );
  await my.end();

  if (DRY_RUN) {
    console.log(`dry run complete — would import ${imported} certificates across ${srcPairs.length} (prefix, typeCode) pairs`);
    return;
  }

  const tgtPairs = await pg.$queryRaw<{ prefix: string; typeCode: string; n: bigint }[]>`
    SELECT s."serialPrefix" AS prefix, split_part(c."serialNumber", '/', 2) AS "typeCode", COUNT(*) AS n
    FROM certificates c JOIN seasons s ON s.id = c."seasonId"
    GROUP BY 1, 2 ORDER BY 1, 2`;

  const key = (p: string, t: string) => `${p}/${t}`;
  const target = new Map(tgtPairs.map((r) => [key(r.prefix, r.typeCode), Number(r.n)]));
  let mismatches = 0;
  for (const r of srcPairs as { prefix: string; typeCode: string; n: number }[]) {
    const got = target.get(key(r.prefix, r.typeCode)) ?? 0;
    const ok  = got === Number(r.n);
    if (!ok) mismatches++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${r.prefix}/${r.typeCode}: source ${r.n} → target ${got}`);
  }

  const [{ count: totalTarget }] = await pg.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) count FROM certificates`;
  const [{ count: nullSeason }]  = await pg.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) count FROM certificates WHERE "seasonId" IS NULL`;
  const [{ count: distinct }]    = await pg.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "serialNumber") count FROM certificates`;
  console.log(`  total ${totalTarget} | distinct serials ${distinct} | null seasonId ${nullSeason} | pair mismatches ${mismatches}`);

  if (mismatches || Number(totalTarget) !== Number(distinct)) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pg.$disconnect());
