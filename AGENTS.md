# Working notes for this repo

## Commands

```sh
npm run dev          # Next dev server (Turbopack)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:migrate   # prisma migrate dev
npx prisma migrate deploy   # apply migrations (what the deploy does)
```

Deployment is GitHub Actions on push to `main` (`.github/workflows/deploy.yml`):
it builds the image, copies `.env.production` generated from repo secrets to
`/opt/mt/.env.production` on the server, runs the migrator container, then
recreates the `mt` container. Environment values therefore live in **GitHub
secrets** — editing `/opt/mt/.env.production` on the server alone is reverted by
the next deploy.

## Prisma

`schema.prisma` has drifted from the migration history for a few pre-existing
objects (`competitions.eventId` / `status`, `EventScope` values, some
`updatedAt` defaults). Consequently:

- **Never** generate a migration with `prisma migrate diff` and commit it
  wholesale — it will include unrelated `DROP COLUMN` / `ALTER TYPE` statements
  that would run against production. Diff, then hand-scope the SQL to the objects
  your change actually introduces.
- `prisma migrate status` reporting "up to date" does not mean the schema and the
  database agree.

## Certificates module

Ported from the old app (`mt25`, MySQL) — see `CERT_PLAN.md` for the full design.

**The archival contract, which must not be "fixed":** `certificates` has foreign
keys to `seasons` and `cert_template_versions` and to **nothing else**.
`participantId`, `contingentId`, `teamId`, `eventId` and `competitionId` are
opaque strings with no referential integrity on purpose, so that purging a past
season's participants, teams, contingents and events can neither cascade into
certificates nor fail on a constraint. Every field token in
`src/lib/certificates/fields.ts` must resolve from the certificate row or its
season — never from operational tables.

```sh
npx tsx prisma/check-archival-contract.ts   # fails if that invariant is broken
npx tsx prisma/migrate-certificates.ts --dry-run   # re-runnable mt25 import
```

Other load-bearing decisions:

- **Nothing is ever written to disk.** mt25 accumulated 135 GB of generated PDFs
  before moving to on-demand rendering. `render.ts` renders in memory, per
  request.
- **`src/lib/certificates/render.ts` is the only place config becomes geometry.**
  Config is in PDF points, top-left origin, y downward; the renderer does the
  single `yPdf = pageHeight - y` conversion and uses real font metrics. The
  editor canvas is an SVG whose viewBox is the page in points, so it draws the
  same numbers; the "true preview" renders the actual PDF because the canvas is
  an approximation for non-baseline `vAlign`.
- **Do not reintroduce calibration sliders** (`scaleX`/`scaleY`/`offsetY`/
  `baselineRatio`). They were mt25's workaround for that coordinate bug;
  `upgradeV1Config` folds them into absolute coordinates once, at import.
- **Serial numbers are immutable.** mt25 serials are four-part
  (`MT25/CONT/T29/000001`, the `T29` being the template id); new issues are
  three-part per (season, typeCode). Imported serials are never rewritten — they
  are printed on 117 k certificates.
- **Editing a published template never changes issued certificates.** Edits go to
  `draftConfig`; **Publish** freezes a new `CertTemplateVersion` and issued rows
  keep pointing at the version they were issued against.
- Fonts live in `public/fonts/certificates/` (OFL) because `public/` is what the
  Docker runner copies; `helvetica` is kept only because imported mt25 templates
  rendered as Helvetica and must keep looking that way.
