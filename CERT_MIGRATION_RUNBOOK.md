# Runbook — migrating mt25 certificates into `mt` production

Moves the 2025/2026 certificate dataset out of the old app (`mt25`, MySQL `mtdb`)
into this app's certificate module (PostgreSQL `mtdb` on the production server).

Design rationale lives in `CERT_PLAN.md`; the invariants that must not be broken
are in `AGENTS.md`. This file is the operational procedure only.

Rehearsed end to end against local `mtdb26` on 2026-09-15: 117,417 rows, all 13
(prefix, typeCode) pairs matching source counts, 0 dropped config elements.

---

## 1. What gets migrated

| Source (MySQL `mtdb`) | Rows | Target (PostgreSQL) |
| --- | --- | --- |
| `cert_template` | 51 | `cert_templates` + `cert_template_versions` (version 1 each) |
| `certificate` | 117,417 | `certificates` |
| `certificate_serial` | 58 | *not copied* — `cert_serial_counters` is reseeded from the serials themselves |
| 7 `basePdfPath` values | 6 unique files | R2 `cert-templates/<sha1>.pdf` |

Three seasons are created (idempotent, keyed on `code`):

| `code` | Year | Prefix | State | Holds |
| --- | --- | --- | --- | --- |
| `MT25` | 2025 | `MT25` | archived | 116,623 imported certificates |
| `MT26-LEGACY` | 2026 | `MT26` | archived | 794 certificates mt25 issued in Jan 2026 |
| `MT26` | 2026 | `MT26` | **current** | nothing yet; this is what new issues go into |

`archived` means render-and-look-up only: no issuing, no publishing, no editing.
`MT26` inherits the counters seeded from the imported `MT26/*` maxima
(`GEN` 474, `PART` 272, `SWIN` 32, `TRAIN` 13), so the first new certificate
continues the printed number line instead of colliding with it.

---

## 2. Topology — why the script runs from the laptop, through a tunnel

```
laptop                                     server 124.217.254.122
├── MySQL  mtdb          (localhost:3306)  ├── PostgreSQL 16 mtdb (host, :5432)
├── mt25/public/uploads/templates/*.pdf    │     pg_hba: local connections only
├── repo /mt + node + tsx                  └── container `mt` (--network host)
└── ssh -L 55432 ────────────────────────────────┘
                         \                    /
                          └── R2 bucket mt-galleries (shared by both)
```

The source MySQL database and the base PDFs exist **only on the laptop**, so the
import runs there. Production Postgres cannot be reached directly, though:
port 5432 does answer from the internet, but `pg_hba.conf` has no entry for
outside hosts, so a direct attempt fails with

```
FATAL: no pg_hba.conf entry for host "<your ip>", user "...", database "mtdb"
```

Through an SSH tunnel the connection arrives as `127.0.0.1` and is accepted.
That is the supported path and the one the commands below use.

> **Observation, not a task:** 5432 accepting TCP from anywhere is unnecessary
> given `pg_hba` refuses those hosts anyway. Firewalling the port to the server
> would remove the noise, and nothing in this app depends on it — the `mt`
> container connects over `localhost`.

---

## 3. Preconditions

- [ ] Production is on a build that contains the certificate module — verify the
      migration is recorded, not just that the code deployed (needs the tunnel
      and `$PROD_DB` from §4.0):

      ```sh
      psql "$PROD_DB" -c "
        SELECT migration_name, rolled_back_at FROM _prisma_migrations
        WHERE migration_name LIKE '%certificates_module%';"
      ```

      Expect `20260915000002_certificates_module` with `rolled_back_at` null.
      Local client tooling is PostgreSQL 18.x against a 16.15 server, which is
      the supported direction.

- [ ] Base assets are already in R2 and reachable on the production host (they
      were uploaded during the local rehearsal — content-addressed, so this is a
      one-time fact, not a per-run step):

      ```sh
      curl -sI https://galleries.techlympics.my/cert-templates/7b6a38b0861dba1ab21ce37574ecc173cd9740c0.pdf | head -1
      ```

      Expect `HTTP/2 200`. If any asset is missing, drop `--skip-assets` from the
      commands below and the script re-uploads from `mt25/public`.

      `~/a-job/repo/mt25/public/uploads/templates/` must exist either way:
      `--skip-assets` skips the *upload*, not the read — the object key is the
      SHA-1 of the file, so the script still hashes each PDF to work out the URL
      to record.

- [ ] Local MySQL is up and `~/a-job/repo/mt25/.env` still holds its
      `DATABASE_URL` (the script reads the credentials from there).

- [ ] The production database credentials, taken from the server and **not**
      committed anywhere:

      ```sh
      cd ~/a-job/server/shinjiru/122
      ./ssh-run.exp "grep '^DATABASE_URL=' /opt/mt/.env.production"
      ```

      Keep the user, password and database name; the host and port are replaced
      by the tunnel (`localhost:55432`) in §4.

- [ ] A database backup taken immediately before the run. The import only
      inserts, but 117 k rows is not a thing to re-do blind. Production Postgres
      runs on the server host (not in a container), so dump it there rather than
      pulling the whole database over the network:

      ```sh
      cd ~/a-job/server/shinjiru/122
      ./ssh-run.exp "sudo -u postgres pg_dump mtdb | gzip > /root/mtdb-pre-cert-import.sql.gz && ls -la /root/mtdb-pre-cert-import.sql.gz"
      ```

      `/organizer/backups` in the app produces an equivalent dump if you prefer
      the UI.

---

## 4. Procedure

### 4.0 Open the tunnel

In its own terminal, and leave it running for the whole procedure:

```sh
ssh -p 53133 -L 55432:localhost:5432 -N root@124.217.254.122
```

Confirm it is up and that Postgres answers through it — a wrong password here is
the *good* outcome, because it proves `pg_hba` accepted the connection:

```sh
PGPASSWORD=wrong psql "postgresql://probe@localhost:55432/mtdb" -c "select 1"
# expect: FATAL: password authentication failed for user "probe"
# NOT:    FATAL: no pg_hba.conf entry for host ...
```

Then export the two values once per shell so they cannot drift between commands:

```sh
cd ~/a-job/repo/mt
export PROD_DB='postgresql://USER:PASSWORD@localhost:55432/mtdb'
export PROD_R2='https://galleries.techlympics.my'
```

`PROD_R2` matters: the laptop's `.env` points at
`https://pub-b6c1701666f548c9a00d0a12bb84d73d.r2.dev`, which serves the same
bucket but is not the hostname production uses. The recorded `baseAssetUrl`
should read the way the rest of production reads.

### 4.1 Dry run — reads, maps, verifies, writes nothing

```sh
DATABASE_URL="$PROD_DB" NEXT_PUBLIC_R2_PUBLIC_URL="$PROD_R2" \
  npx tsx prisma/migrate-certificates.ts --dry-run --skip-assets
```

Expected tail:

```
templates: 51 read, 0 written, 0 elements dropped
serial counters seeded for 13 (prefix, typeCode) pairs
certificates: 117417/117417
dry run complete — would import 117417 certificates across 13 (prefix, typeCode) pairs
```

Stop and investigate if you see any of:

- `certificates reference a missing template — aborting` — an orphan appeared in
  the source since the rehearsal;
- a non-zero “elements dropped” count — a template config contains a placeholder
  the field registry does not know; the element would be silently missing from
  rendered PDFs;
- any `! unparseable serial` or `! no season for prefix` line.

### 4.2 The import

```sh
DATABASE_URL="$PROD_DB" NEXT_PUBLIC_R2_PUBLIC_URL="$PROD_R2" \
  npx tsx prisma/migrate-certificates.ts --skip-assets
```

Roughly 2–4 minutes over the network, inserting in batches of 2,000
(`--batch=N` to change). It finishes with its own verification and exits
non-zero if anything fails to reconcile:

```
  ok   MT25/CONT: source 806 → target 806
  ...13 lines...
  total 117417 | distinct serials 117417 | null seasonId 0 | pair mismatches 0
```

### 4.3 Verification

Source and target, compared independently of the script:

```sh
# source
mysql -u azham -p mtdb -e "
  SELECT SUBSTRING_INDEX(serialNumber,'/',1) prefix,
         SUBSTRING_INDEX(SUBSTRING_INDEX(serialNumber,'/',2),'/',-1) typeCode,
         COUNT(*) n FROM certificate GROUP BY prefix, typeCode ORDER BY prefix, typeCode;"

# target
psql "$PROD_DB" -c "
  SELECT s.\"serialPrefix\" prefix, split_part(c.\"serialNumber\",'/',2) \"typeCode\", COUNT(*) n
  FROM certificates c JOIN seasons s ON s.id = c.\"seasonId\"
  GROUP BY 1,2 ORDER BY 1,2;"
```

Then the invariants:

```sh
# no foreign keys from certificates into purgeable tables
DATABASE_URL="$PROD_DB" npx tsx prisma/check-archival-contract.ts

# counters are above every imported serial, so the next issue cannot collide
psql "$PROD_DB" -c "
  SELECT s.code, k.\"typeCode\", k.\"lastSequence\"
  FROM cert_serial_counters k JOIN seasons s ON s.id = k.\"seasonId\"
  ORDER BY s.code, k.\"typeCode\";"

# every certificate points at a template version that has a base asset
psql "$PROD_DB" -c "
  SELECT COUNT(*) FROM certificates c
  JOIN cert_template_versions v ON v.id = c.\"templateVersionId\"
  WHERE v.\"baseAssetUrl\" IS NULL OR v.\"baseAssetUrl\" = '';"
```

Finally the part no query can prove — that a certificate still renders:

1. open `https://techlympics.my/organizer/certificates/issued`;
2. search a known name or serial (e.g. `MT25/GEN/T16/000001`);
3. download the PDF and check the text sits inside the artwork, not over it.

Do this for one certificate per `targetType` (`GEN`, `PART`, `WIN`, `NCP`,
`QPART`, `QWIN`, `TRAIN`, `CONT`, `SWIN`) — nine downloads, and it is the only
check that exercises fonts, geometry and R2 together.

### 4.4 Fallback: running entirely on the server

Only needed if the tunnel is unavailable. Untested — prefer §4.0–4.2.

The blocker is that MySQL `mtdb` lives on the laptop, so the source has to travel:

```sh
# laptop — the three tables the script reads
mysqldump -u azham -p mtdb cert_template certificate certificate_serial \
  | gzip > /tmp/mtdb-certs.sql.gz
cd ~/a-job/server/shinjiru/122 && ./scp-up.exp /tmp/mtdb-certs.sql.gz /root/

# laptop — the base PDFs, only if they ever need re-uploading
tar czf /tmp/mt25-templates.tgz -C ~/a-job/repo/mt25/public uploads/templates
./scp-up.exp /tmp/mt25-templates.tgz /root/
```

On the server, load the dump into a throwaway MySQL/MariaDB container, then run
the script from the **migrator** image — it is the only image with the full
`node_modules` (it carries `tsx` and `mysql2`; the runtime image does not,
because Next only traces what the app imports). Mount `/opt/mt` for the source,
since the script imports from `src/lib/certificates/`, and point
`--source-env` at a file holding the temporary MySQL URL.

Remember to drop the throwaway database afterwards — it contains a full copy of
the 2025 certificate dataset.

---

## 5. Replaying and rolling back

**Replay is safe.** Certificates are inserted with `skipDuplicates` against the
unique `legacyCertId`, seasons and templates are keyed on `code` and
`(seasonId, name)`, and counters only ever move forward. A run interrupted
halfway can simply be repeated; already-imported rows are skipped.

**Rollback is destructive and must be a deliberate decision.** Delete
certificates before template versions — `certificates.templateVersionId` is
`ON DELETE RESTRICT`, so the FK protects you from doing it in the wrong order:

```sql
BEGIN;
-- everything this import created, and nothing issued by this app
DELETE FROM certificates WHERE "legacyCertId" IS NOT NULL;

-- only if the imported designs should go too
DELETE FROM cert_template_versions v
 USING cert_templates t, seasons s
 WHERE v."templateId" = t.id AND t."seasonId" = s.id
   AND s.code IN ('MT25','MT26-LEGACY');

-- counters for the archived seasons; leave MT26 alone if it has issued anything
DELETE FROM cert_serial_counters
 WHERE "seasonId" IN (SELECT id FROM seasons WHERE code IN ('MT25','MT26-LEGACY'));
COMMIT;
```

Check `SELECT COUNT(*) FROM certificates WHERE "legacyCertId" IS NULL;` first —
if it is non-zero, this app has issued its own certificates and a blanket
rollback is no longer the whole story.

---

## 6. Known, accepted losses

These are decisions, not defects. They are listed so nobody rediscovers them as
bugs in 2027.

- **`participantId` / `contingentId` are left NULL.** The tier-2 soft-reference
  backfill (match by IC for participants, name+state for contingents) was
  skipped. Consequence: a 2025 participant logging in today sees nothing under
  "my certificates"; organizer and public lookup are the access paths. The
  backfill can still be run **while the 2025/2026 datasets exist** — after the
  2027 purge it becomes impossible. `legacyParticipantId` / `legacyContingentId`
  are preserved verbatim for exactly this.
- **`filePath` is dropped.** 29,959 source rows still pointed at pre-2026
  generated PDFs. If any of those files differ from what the template now
  renders, that difference is gone. Spot-check a handful against the new output
  before deleting the old files.
- **`issue_date` now means the issue date.** mt25 printed
  `new Date()` — the day the PDF was generated. Reprinting a 2025 certificate
  therefore shows its `issuedAt`, not today.
- **Fonts.** Imported templates render in Helvetica, because that is what mt25
  embedded regardless of the `font_family` its editor offered. Helvetica is a
  standard PDF font and cannot encode characters outside WinAnsi, so a Chinese
  or Tamil school name has its unmappable characters substituted and a warning
  logged (`characters outside WinAnsi replaced`) rather than failing the
  download. Fixing one of those certificates means switching that template to an
  embedded font (`inter` / `lora`) and republishing — which affects only
  certificates issued against the new version.
- **Template names carry their legacy id** (`[16] Sijil Penyertaan - …`) so a
  mt25 serial segment (`…/T16/…`) can be traced back to a template by eye.

---

## 7. After the import

- Set `MT26` as the season new certificates are issued into (it is already
  `isCurrent`), and build the 2026 designs with **Duplicate to season** from the
  imported MT25 templates rather than redrawing them.
- The 2027 cleanup, when it comes, is `CERT_PLAN.md` §3: stamp
  `seasons.archivedAt`, delete the operational rows in FK order, leave
  `certificates` and `cert_template_versions` untouched. Re-run
  `prisma/check-archival-contract.ts` first — if it fails, a foreign key has
  crept in and the delete will either cascade into certificates or be blocked.
