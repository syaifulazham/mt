# Certificate Module — Plan

Port of the certificate feature from the old app (`mt25`, MySQL) into this app
(`mt`, PostgreSQL + Prisma + cuid ids), with two requirements driving the design:

1. **Old seasons must survive the cleanup of the main dataset.** In 2027 we want to
   delete 2025/2026 participants, teams, contingents and events while keeping every
   certificate downloadable and verifiable.
2. **Season metadata must be explicit** (Techlympics 2025, 2026, …), not inferred.

---

## 0. What mt25 actually does (measured, not assumed)

Schema (`mt25/prisma/schema.prisma`):

| Table | Shape |
| --- | --- |
| `cert_template` | `configuration Json`, `basePdfPath`, `targetType` enum, `prerequisites Json`, `winnerRangeStart/End`, `status`, `eventId`/`quizId` |
| `certificate` | denormalised recipient snapshot (`recipientName`, `contingent_name`, `team_name`, `ic_number`, `contestName`, `awardTitle`) + `uniqueCode`, `serialNumber`, `filePath`, `status`, `ownership Json` |
| `certificate_serial` | `(year, targetType, templateId)` → `lastSequence` |

Serial format: `MT{YY}/{TYPE_CODE}/{6-digit sequence}` — e.g. `MT25/GEN/000001`.
Type codes in use: `GEN`, `PART`, `WIN`, `NCP`, `QPART`, `QWIN`, `TRAIN`, `CONT`, `SWIN`.

Rendering: `src/lib/services/pdf-generator-service.ts` — `pdf-lib`, base PDF read from
`public/`, elements drawn as text, PDF returned as a buffer and streamed. This is the
**on-demand** design adopted after certificates filled the disk (135 GB in
`public/uploads/certificates/`, documented in `CERTIFICATE_STORAGE_OPTIMIZATION.md`).

Editor: `src/app/organizer/certificates/_components/TemplateEditorFixed.tsx` (2,564 lines)
alongside an older `TemplateEditor.tsx` (693 lines), plus `CalibrationControls.tsx`
exposing `scaleX`, `scaleY`, `offsetY`, `baselineRatio` sliders per template.

### Live profile of `mtdb` (queried 2026-09-15)

```
cert_template            51 rows      (7 distinct basePdfPath, 0 null)
certificate         117,417 rows
certificate_serial       58 rows
createdAt span      2025-10-27 → 2026-01-29
```

| Season (serial prefix) | Count |
| --- | --- |
| `MT25` | 116,623 |
| `MT26` | 794 |

| targetType | Certificates | Templates |
| --- | --- | --- |
| GENERAL | 56,055 | 1 |
| QUIZ_PARTICIPANT | 25,794 | 15 |
| EVENT_PARTICIPANT | 25,217 | 9 |
| EVENT_WINNER | 5,662 | 9 |
| TRAINERS | 2,856 | 1 |
| CONTINGENT | 806 | 1 |
| SCHOOL_WINNER | 547 | 1 |
| NON_CONTEST_PARTICIPANT | 410 | 3 |
| QUIZ_WINNER | 70 | 7 |

Data-quality facts that shape the migration:

- `serialNumber` is populated on **all 117,417 rows** → usable as the natural key.
- `ownership` JSON is **NULL on 59,321 rows (50.5 %)** → *cannot* be the season key.
  The serial prefix can (and covers 100 %).
- `filePath` is still set on **29,959 rows** — leftovers from the pre-on-demand era.
- `recipientType` is free text and inconsistent: `PARTICIPANT` (112,884), `TRAINER`
  (2,856), `CONTINGENT` (806), `contestant` (547, lowercase), `WINNER` (324).
- Only **7 base PDFs** exist for 51 templates → asset migration is trivial (~20 MB).

### Carry over / drop

| mt25 idea | Decision |
| --- | --- |
| On-demand PDF generation, nothing written to disk | **Keep.** Non-negotiable; this was a production incident. |
| `pdf-lib` for rendering | **Keep.** Drop `jspdf` (unused for this path). |
| Denormalised recipient snapshot on the certificate row | **Keep and extend** — it is what makes requirement 1 possible. |
| `MT{YY}/{TYPE}/{SEQ}` serial format | **Keep exactly.** 117 k serials are already printed on issued certificates; renumbering would invalidate them. |
| `ownership Json` for year/contingent/contestant | **Drop as JSON** → promote to real, indexed columns. Half the rows are NULL and Postgres JSON path filtering here buys nothing. |
| `targetType` enum on the template | **Keep**, normalised, and make the type code derive from it. |
| `prerequisites Json` gating downloads | **Keep, phase 2.** |
| `calibration` sliders (`scaleX/scaleY/offsetY/baselineRatio`) | **Drop.** These are a workaround for a coordinate bug; fix the bug instead (§4.1). |
| Two editor components, one named `…Fixed` | **Drop.** One editor. |
| Forcing `.toUpperCase()` on every dynamic value in the renderer | **Drop.** Make it a per-element `transform` option. |
| `filePath` on the certificate | **Drop the column.** No file is ever produced. |
| Free-text `recipientType`, `status` | **Enums.** |

---

## 1. Data model

Conventions follow this repo: `String @id @default(cuid())`, `@@map` to snake_case,
Malay-facing labels in the UI only.

### 1.1 Season — the metadata anchor

```prisma
model Season {
  id        String   @id @default(cuid())
  code      String   @unique          // "MT25", "MT26" — the serial prefix
  year      Int      @unique          // 2025, 2026
  name      String                    // "Malaysia Techlympics 2025"
  isCurrent Boolean  @default(false)  // exactly one true; enforced in app + partial index
  archivedAt DateTime?                // set when the main dataset for it is purged
  createdAt DateTime @default(now())

  templates    CertTemplate[]
  certificates Certificate[]
  serialCounters CertSerialCounter[]

  @@map("seasons")
}
```

`code` is deliberately the same string that appears in the serial number, so a serial
is self-describing and the migration can key off it. `archivedAt` records that the
season's operational data has been cleaned up — the UI uses it to stop offering
"regenerate from live data" actions for that season.

> One `Season` row per edition. Prefer this over an `AppSetting` key because the
> display name, the serial prefix and the archive flag all need a home, and serial
> counters need something to hang off.

### 1.2 Template + immutable version

The archival requirement has a subtle consequence: with on-demand rendering, a
certificate's *appearance* depends on the template as it is **today**. Edit a 2025
template in 2027 and 116 k already-issued certificates silently change. So the
template is split into a mutable head and immutable published versions.

```prisma
model CertTemplate {
  id           String                 @id @default(cuid())
  seasonId     String
  name         String
  targetType   CertTargetType
  status       CertTemplateStatus     @default(DRAFT)
  currentVersionId String?            @unique
  competitionId String?               // optional narrowing, soft ref (no relation)
  eventId       String?
  winnerRankFrom Int?
  winnerRankTo   Int?
  prerequisites  Json?                // phase 2
  createdBy     String
  updatedBy     String?
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt

  season        Season                @relation(fields: [seasonId], references: [id])
  versions      CertTemplateVersion[] @relation("TemplateVersions")
  currentVersion CertTemplateVersion? @relation("CurrentVersion", fields: [currentVersionId], references: [id])

  @@index([seasonId, targetType])
  @@index([status])
  @@map("cert_templates")
}

model CertTemplateVersion {
  id            String   @id @default(cuid())
  templateId    String
  version       Int
  baseAssetUrl  String                 // R2 URL of the base PDF or PNG
  baseAssetType CertAssetType          // PDF | IMAGE
  configuration Json                   // schema v2, see §4.2
  publishedAt   DateTime @default(now())
  publishedBy   String?

  template      CertTemplate  @relation("TemplateVersions", fields: [templateId], references: [id], onDelete: Cascade)
  headOf        CertTemplate? @relation("CurrentVersion")
  certificates  Certificate[]

  @@unique([templateId, version])
  @@map("cert_template_versions")
}

enum CertTargetType {
  GENERAL
  EVENT_PARTICIPANT
  EVENT_WINNER
  NON_CONTEST_PARTICIPANT
  QUIZ_PARTICIPANT
  QUIZ_WINNER
  TRAINER
  CONTINGENT
  SCHOOL_WINNER
}

enum CertTemplateStatus { DRAFT ACTIVE ARCHIVED }
enum CertAssetType { PDF IMAGE }
```

Editing a published template writes to the draft config; **Publish** freezes a new
`CertTemplateVersion` and moves `currentVersionId`. Issued certificates keep pointing
at the version they were issued against.

### 1.3 Certificate — self-contained by construction

```prisma
model Certificate {
  id          String   @id @default(cuid())
  seasonId    String
  templateVersionId String

  // ── Public identifiers ───────────────────────────────────────────────
  serialNumber String  @unique          // MT25/GEN/000001 — human readable, printed
  uniqueCode   String  @unique          // opaque token used for public verification
  status       CertStatus @default(READY)
  issuedAt     DateTime?
  revokedAt    DateTime?
  revokedReason String?

  // ── Snapshot: everything the PDF needs, frozen at issue time ─────────
  recipientName    String
  recipientType    CertRecipientType
  recipientIc      String?
  recipientEmail   String?
  contingentName   String?
  schoolName       String?
  stateName        String?
  teamName         String?
  competitionName  String?
  competitionCode  String?
  eventName        String?
  awardTitle       String?
  rank             Int?
  meta             Json?                // long tail: quiz score, category, …

  // ── Soft references: plain columns, deliberately NOT relations ───────
  participantId  String?
  contingentId   String?
  teamId         String?
  eventId        String?
  competitionId  String?
  legacyCertId       Int?  @unique      // mt25 certificate.id
  legacyParticipantId Int?
  legacyContingentId  Int?

  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  season          Season              @relation(fields: [seasonId], references: [id])
  templateVersion CertTemplateVersion @relation(fields: [templateVersionId], references: [id])

  @@index([seasonId, status])
  @@index([participantId])
  @@index([contingentId])
  @@index([recipientIc])
  @@index([recipientName])
  @@index([templateVersionId])
  @@map("certificates")
}

enum CertStatus { DRAFT LISTED READY REVOKED }
enum CertRecipientType { PARTICIPANT TRAINER CONTINGENT MANAGER OTHER }
```

**The archival contract — state it, test it, don't break it:**

> `certificates` has foreign keys to `seasons` and `cert_template_versions` and to
> **nothing else**. `participantId`, `contingentId`, `teamId`, `eventId` and
> `competitionId` are opaque strings with no referential integrity on purpose.
> `seasons`, `cert_templates` and `cert_template_versions` are never purged.

Consequences, which are exactly requirement 1:

- `DELETE FROM contestants` / `teams` / `contingents` / `events` cannot cascade into
  certificates and cannot fail on a constraint.
- A 2025 certificate renders in 2027 from its own row plus its frozen template
  version. No join to operational data is required at render time.
- The soft refs still power "my certificates" and contingent-scoped lists **while**
  the main dataset exists, and degrade to dead ids afterwards without breaking reads.

Guard against future regression — add to CI or a pre-migration check:

```sql
-- Must return zero rows: no FK from certificates into purgeable tables
SELECT conname, confrelid::regclass AS references
FROM pg_constraint
WHERE conrelid = 'certificates'::regclass
  AND contype  = 'f'
  AND confrelid::regclass::text NOT IN ('seasons', 'cert_template_versions');
```

Note this rule in `AGENTS.md` so it is not "helpfully" normalised away later.

### 1.4 Serial counters

```prisma
model CertSerialCounter {
  id           String   @id @default(cuid())
  seasonId     String
  typeCode     String   @db.VarChar(10)   // GEN, PART, WIN, QPART, …
  lastSequence Int      @default(0)
  updatedAt    DateTime @updatedAt

  season       Season   @relation(fields: [seasonId], references: [id])

  @@unique([seasonId, typeCode])
  @@map("cert_serial_counters")
}
```

Two changes from mt25: the counter is keyed by **(season, typeCode)** rather than
`(year, targetType, templateId)` — mt25's per-template counters are why 58 counter
rows exist for 9 type codes, and they make the sequence non-contiguous per printed
type. Allocation is a single atomic statement, not application-level locking:

```ts
const [row] = await tx.$queryRaw<{ lastSequence: number }[]>`
  UPDATE cert_serial_counters SET "lastSequence" = "lastSequence" + 1, "updatedAt" = now()
  WHERE "seasonId" = ${seasonId} AND "typeCode" = ${typeCode}
  RETURNING "lastSequence"`;
const serial = `${season.code}/${typeCode}/${String(row.lastSequence).padStart(6, "0")}`;
```

Gaps are acceptable (mt25 says so too) — uniqueness and monotonicity are what matter.

### 1.5 Optional: download log

`cert_download_log (id, certificateId, actorType, actorId, at, ip)` — cheap, answers
"did this participant ever get it", and it is the only way to reconstruct usage once
PDFs are never stored. Recommended but not required for phase 1.

---

## 2. Migration from MySQL `mtdb`

Precedent to follow: `prisma/migrate-schools.ts` in this repo already reads MySQL via
`mysql2/promise` and writes Postgres via Prisma. New script: `prisma/migrate-certificates.ts`,
run with `npx tsx`.

### 2.1 Order of operations

1. **Seasons.** Insert `MT25`/2025/"Malaysia Techlympics 2025" and `MT26`/2026.
   `isCurrent = true` on 2026.
2. **Base assets.** 7 files from `mt25/public/…` → R2 under `cert-templates/<sha1>.pdf`,
   using the existing R2 client pattern (`src/app/api/v2/organizer/reference-data/themes/upload/route.ts`,
   env `R2_ACCOUNT_ID` / `R2_BUCKET_NAME` / `NEXT_PUBLIC_R2_PUBLIC_URL`). Build a
   `oldPath → newUrl` map.
3. **Templates + version 1.** 51 rows. `targetType` maps 1:1 except `TRAINERS → TRAINER`.
   Season for a template = season of the majority of its certificates (all 51 are
   MT25-era; MT26 templates get created fresh in the new editor). Configuration is
   copied through the **v1 → v2 config upgrader** (§4.2) so that legacy calibration is
   folded into absolute coordinates once, at migration time, and never carried forward.
4. **Serial counters — before certificates.** Seed from the source so new issues cannot
   collide with imported serials:
   ```sql
   SELECT SUBSTRING_INDEX(serialNumber,'/',1)                        AS prefix,
          SUBSTRING_INDEX(SUBSTRING_INDEX(serialNumber,'/',2),'/',-1) AS typeCode,
          MAX(CAST(SUBSTRING_INDEX(serialNumber,'/',-1) AS UNSIGNED)) AS maxSeq
   FROM certificate GROUP BY prefix, typeCode;
   ```
5. **Certificates.** 117,417 rows, batched at ~2,000 with `createMany`, ordered by `id`.
   Mapping:

| Target | Source |
| --- | --- |
| `seasonId` | `SUBSTRING_INDEX(serialNumber,'/',1)` → season by `code`. Authoritative; covers the 59 k rows with NULL `ownership`. |
| `serialNumber`, `uniqueCode` | as-is (both already unique in source) |
| `templateVersionId` | version 1 of the migrated template for `certificate.templateId` |
| `recipientName`, `recipientEmail` | as-is |
| `recipientIc` | `ic_number` |
| `recipientType` | normalise: `PARTICIPANT`/`contestant` → `PARTICIPANT`, `TRAINER` → `TRAINER`, `CONTINGENT` → `CONTINGENT`, `WINNER` → `PARTICIPANT` (it describes the award, not the recipient) |
| `contingentName`, `teamName`, `competitionName`, `awardTitle` | `contingent_name`, `team_name`, `contestName`, `awardTitle` |
| `status` | `LISTED`/`READY` pass through; anything else → `READY` |
| `issuedAt` | `issuedAt ?? createdAt` |
| `legacyCertId` | `certificate.id` — idempotency key |
| `legacyParticipantId`, `legacyContingentId` | `ownership->>'$.contestantId'`, `ownership->>'$.contingentId'` where present |
| `participantId`, `contingentId` | best-effort match (§2.2), else NULL |
| `filePath` | **dropped** |

6. **Verify** (§2.3), then flip a `certificates.legacyImportedAt`-style marker or simply
   rely on `legacyCertId IS NOT NULL`.

### 2.2 Soft-reference mapping across id systems

mt25 uses integer ids; this app uses cuids, so old `contestantId 6501` means nothing
here. Three tiers, in order:

1. Keep `legacyParticipantId` / `legacyContingentId` verbatim — always possible, and
   enough for audit and for cross-referencing against a MySQL backup later.
2. Best-effort resolve to current cuids by **IC number** for participants
   (`certificate.ic_number` → `contestants.ic`) and by name+state for contingents.
   Only for rows where the match is unique; log ambiguous ones.
3. Leave NULL otherwise. **This is fine** — the snapshot columns carry the printable
   truth, and requirement 1 says the certificate must not depend on those rows.

Do not block the migration on tier 2. It can be re-run later as a backfill while the
2025/2026 datasets still exist; after the 2027 purge it becomes impossible, so run it
once before then if participant-portal continuity for 2025 matters.

### 2.3 Verification

Run against both databases and require equality:

```sql
-- source (MySQL)
SELECT SUBSTRING_INDEX(serialNumber,'/',1) prefix,
       SUBSTRING_INDEX(SUBSTRING_INDEX(serialNumber,'/',2),'/',-1) typeCode,
       COUNT(*) n FROM certificate GROUP BY prefix, typeCode ORDER BY prefix, typeCode;

-- target (Postgres)
SELECT s.code AS prefix, split_part(c."serialNumber",'/',2) AS "typeCode", COUNT(*) n
FROM certificates c JOIN seasons s ON s.id = c."seasonId"
GROUP BY 1,2 ORDER BY 1,2;
```

Expected: 13 (prefix, typeCode) pairs, 117,417 total. Also assert
`COUNT(DISTINCT serialNumber) = COUNT(*)`, zero NULL `seasonId`, and spot-render 10
certificates per template version against the mt25 output for visual parity.

Re-runnable by design: upsert on `legacyCertId`, so a failed batch can be replayed.

---

## 3. The 2027 cleanup, spelled out

What "clean up the main dataset" then means:

1. `UPDATE seasons SET "archivedAt" = now() WHERE year = 2025;`
2. Delete operational rows for that season (teams, team_events, attendance,
   contestants, contingents, events, …) in FK order.
3. `certificates` and `cert_template_versions` are untouched. No constraint blocks the
   delete; nothing cascades in.

After archiving, for that season:

- Participant-portal "my certificates" returns nothing (no session, no `participantId`
  match) — expected. Access shifts to:
  - **public verification** by `uniqueCode` (not by serial: `MT25/GEN/000123` is
    trivially enumerable, the opaque code is not), and
  - an **organizer lookup** by name / IC / serial, which reads only `certificates`.
- The organizer UI must hide "regenerate from live data" for archived seasons; only
  "download" (pure snapshot render) stays available.

---

## 4. Certificate template editor

Placement follows this repo's layout: pages under
`src/app/(organizer)/organizer/certificates/…`, client components under
`src/components/organizer/certificates/…`, APIs under `/api/v2/organizer/certificates/…`,
write gated on `SUPER_ADMIN` / `ADMIN` via `getOrganizerSession()` (same guard as the
themes upload route).

```
src/app/(organizer)/organizer/certificates/
  page.tsx                     — template list (season filter, targetType, status)
  templates/[id]/page.tsx      — editor (loads draft config server-side)
  issued/page.tsx              — issued certificate browser + lookup
src/components/organizer/certificates/
  TemplateListClient.tsx
  TemplateEditor.tsx           — one component, target < 600 lines
  EditorCanvas.tsx             — base asset + absolutely positioned element boxes
  ElementInspector.tsx         — position / style / content panel
  FieldPicker.tsx              — dynamic fields from the shared registry
  TruePreviewDialog.tsx        — renders the real PDF via the API
src/lib/certificates/
  config-schema.ts             — zod schema for configuration v2 + v1→v2 upgrader
  fields.ts                    — the field registry (single source of truth)
  fonts.ts                     — embedded font registry
  render.ts                    — pdf-lib renderer, used by preview and by download
  serial.ts                    — allocation + parsing
```

### 4.1 Fix the coordinate problem instead of shipping calibration sliders

mt25 exposes `scaleX`, `scaleY`, `offsetY` and `baselineRatio` per template because the
editor and the renderer disagreed: the editor positioned elements in CSS pixels from the
top-left, `pdf-lib` draws from the bottom-left at the **text baseline**, and the renderer
then guessed the baseline as `fontSize * 0.35` plus per-font fudges for Georgia and Times
(`pdf-generator-service.ts` lines 179–203). The sliders are a human calibrating around
that bug, per template.

The contract to adopt instead:

- **Unit:** PDF points (1/72 in). No pixels anywhere in stored config.
- **Origin:** top-left, y grows downward — the intuitive direction for an editor.
- **Anchor:** each text element stores `align` (`left|center|right`) and
  `vAlign` (`top|middle|baseline|bottom`); the *renderer* does the single conversion
  `yPdf = pageHeight - yTop` and applies real font metrics
  (`font.heightAtSize`, `font.widthOfTextAtSize`) rather than a magic ratio.
- **One implementation:** `src/lib/certificates/render.ts` is the only place that maps
  config → geometry, and the editor canvas scales the *same* numbers by a zoom factor
  (`pt → px = pt * zoom`). Editor and PDF cannot drift because there is one formula.
- **Verification:** a "true preview" endpoint renders the actual PDF with sample data,
  displayed in an iframe next to the canvas. WYSIWYG is proven, not asserted.

Once this holds, `calibration` is dead. The migration folds any non-default mt25
calibration into the imported coordinates once (§2.1 step 3) and drops the field.

### 4.2 Configuration schema v2

Zod-validated on write, versioned so future changes are upgradable rather than guessed:

```ts
{
  v: 2,
  canvas: { paper: "A4", orientation: "landscape", width: 842, height: 595 }, // points
  elements: [
    { id, type: "static_text", z, text, x, y, maxWidth?,
      align: "center", vAlign: "baseline",
      style: { font: "inter", size: 24, weight: "bold", color: "#000000",
               letterSpacing?, lineHeight?, transform: "none" | "upper" | "title" } },
    { id, type: "field", z, field: "recipient_name", prefix?, suffix?, fallback?,
      x, y, maxWidth?, fit: "shrink" | "wrap" | "clip", align, vAlign, style },
    { id, type: "image", z, url, x, y, width, height, opacity? },
    { id, type: "qr",    z, encodes: "verify_url", x, y, size }
  ]
}
```

Additions over mt25 that solve real problems seen in its data:

- `fit: "shrink"` — long Malay school/contingent names overflow fixed positions. mt25 had
  no answer; here the renderer reduces size until the text fits `maxWidth`.
- `transform` per element — mt25 forced `.toUpperCase()` on *every* dynamic value in the
  renderer, which is a design choice hard-coded into the engine.
- `fallback` — what to print when a snapshot column is null.
- `qr` encoding the verification URL (`/verify/<uniqueCode>`), which makes the public
  verification route in §3 usable from the printed artifact.

### 4.3 Field registry — one source of truth

`src/lib/certificates/fields.ts` exports the list once; `FieldPicker` renders it and
`render.ts` resolves it. The editor therefore cannot offer a token the renderer will
silently drop (an mt25 failure mode, where the placeholder map lived only inside the
generator).

| Token | Source column |
| --- | --- |
| `recipient_name` | `recipientName` |
| `ic_number` | `recipientIc` |
| `contingent_name` | `contingentName` |
| `school_name`, `state_name` | `schoolName`, `stateName` |
| `team_name` | `teamName` |
| `competition_name`, `competition_code` | `competitionName`, `competitionCode` |
| `event_name` | `eventName` |
| `award_title`, `rank` | `awardTitle`, `rank` |
| `serial_number`, `unique_code` | `serialNumber`, `uniqueCode` |
| `issue_date` | `issuedAt`, formatted `ms-MY` |
| `season_name`, `season_year` | via `Season` |

Every token resolves from the certificate row or its season — never from operational
tables. That property is what makes §3 safe, so keep it as a rule when adding tokens.

### 4.4 Fonts

mt25 embedded only `Helvetica`/`Helvetica-Bold` while letting the editor choose Arial,
Georgia and Times — so previews lied and the per-font offset hacks appeared. Instead:
bundle 2–3 families as TTF in `src/lib/certificates/fonts/`, embed with
`@pdf-lib/fontkit`, and let the editor offer exactly those. Embedding also fixes
encoding: the standard 14 fonts are WinAnsi-only and throw on characters outside it,
which matters for Malay names and any Jawi/Chinese/Tamil school names.

### 4.5 Lifecycle

`DRAFT` → edit freely, no versions. **Publish** → freeze `CertTemplateVersion`, set
`ACTIVE`. Editing an `ACTIVE` template edits the draft config; republishing creates
version *n+1*. Issued certificates keep their version. `ARCHIVED` hides it from
issuing but never deletes it (certificates depend on its versions).
"Duplicate to season" clones the head config into a new template under another season —
that is how the 2026 set starts from the 2025 designs.

---

## 5. Rendering and delivery

- `GET /api/v2/certificates/[id]/download` — loads the certificate + its template
  version, renders with `pdf-lib` in memory, streams `application/pdf`. **No disk
  writes, no cache directory.**
- Bulk: stream a ZIP with `archiver` (already a dependency in mt25; add here) generating
  each PDF on the fly. Cap per request, and for very large batches queue rather than
  hold a request open.
- Filename: `<season code>_<template>_<serial>.pdf` with unsafe characters stripped.
- Access control:
  - organizer: role-gated, all seasons;
  - manager: certificates whose `contingentId` is in their scope;
  - participant: `participantId = session.participantId`;
  - public: `GET /verify/<uniqueCode>` → issuer, recipient name, serial, season,
    status (including `REVOKED`), and a download link. Rate-limit it.

---

## 6. Phasing

| Phase | Content |
| --- | --- |
| 1 | Schema + migration (§1, §2). Read-only issued browser. Download endpoint. No editor yet — migrated templates render as imported. |
| 2 | Editor (§4) incl. true preview, publishing, duplicate-to-season. |
| 3 | Issuing flows per `targetType` (participant, winner by rank range, trainer, contingent), bulk ZIP, prerequisites gating. |
| 4 | Public verification + QR, download log, revocation. |

Phase 1 is independently valuable: it gets 117 k certificates off MySQL and satisfies
requirement 1 before any UI work.

---

## 7. Open questions

1. **Season of the 794 `MT26` certificates.** They were issued from mt25 between
   2026-01 and 2026-01-29, but this app is the 2026 platform. Do they belong to the same
   `MT26` season we will keep issuing into? If yes, the serial counters seeded in §2.1
   step 4 must continue those sequences (`GEN` is already at ~474) rather than restart.
2. **`GENERAL` templates carry 56 k certificates on a single template.** Is that one
   design reused for everything, or should it be split per event when re-created for
   2026? Affects how much of the 51-template set is worth migrating versus recreating.
3. **Tier-2 soft-ref backfill (§2.2)** — worth running for 2025 so participants keep
   seeing their old certificates in the portal, or accept organizer/public lookup only?
   It must happen before the 2027 purge.
4. **Should the 29,959 legacy PDF files be kept anywhere?** The plan discards
   `filePath`; if any of those files differ from what the template now renders, that
   difference is lost. Recommend spot-checking a handful, then discarding.
5. **`prisma migrate` vs raw SQL for the import.** The 117 k-row insert is data, not
   schema; recommend keeping it in `prisma/migrate-certificates.ts` (like
   `migrate-schools.ts`) and out of the migration history.
