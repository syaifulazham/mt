# Production Repair: Bulk-Register Team Cleanup

## Background

The bulk-registration job (pre-`df03b71`) wrongly created one `Team` + `TeamMember`
per selected participant, instead of only writing to `registration_stats`.
This produced tens of thousands of bogus single-member teams (locally: 60,161
under competition `5.2K`).

The fix (`df03b71`) makes the job write **only** to `registration_stats`.
This runbook removes the bogus teams already created in production while
**preserving `registration_stats`**.

## Prerequisites

- Fix `df03b71` (and script `89e924d`) is deployed / pulled on the machine
  you will run the cleanup from.
- You have the production PostgreSQL connection string.
- Node deps installed (`npx tsx` available from the repo root).

## Step 1 — Deploy the fixed code FIRST

Deploy `df03b71` to production **before** cleaning. Otherwise any re-run of
the bulk register job will create new bogus teams.

## Step 2 — Snapshot the production database

Take a backup before deleting anything, e.g. an RDS snapshot, or:

```bash
pg_dump "$PROD_DATABASE_URL" \
  -t teams -t team_members -t registration_stats \
  -f backup-bulk-register-cleanup-$(date +%Y%m%d).sql
```

## Step 3 — Dry-run (identify candidates)

```bash
DATABASE_URL="postgresql://<prod-user>:<prod-pass>@<prod-host>:5432/<prod-db>" \
  npx tsx scripts/cleanup-bulk-register-teams.ts
```

Expected output:

- `candidate job-created teams: <N>` with per-competition breakdown
- `registration_stats rows (kept): <M>` — the stats table is intact
- 3 sample rows showing team/stat timestamps (team should be created
  milliseconds before the stat)
- `DRY-RUN — no changes made.`

Sanity checks before proceeding:

- Candidates are only under competitions you actually bulk-registered.
- Count looks consistent with the bulk-register job's report
  (`registered` count shown in the UI / job poller).

## Step 4 — Delete

```bash
DATABASE_URL="postgresql://<prod-user>:<prod-pass>@<prod-host>:5432/<prod-db>" \
  npx tsx scripts/cleanup-bulk-register-teams.ts --commit
```

The script deletes `team_members` first, then `teams`, in batches of 2,000,
with progress output. `registration_stats` is never touched.

## Step 5 — Verify

1. Re-run the dry-run — it must report `0 candidates`.
2. Open `/organizer/data-watch` — **Registered** counts now come from
   `registration_stats` only.
3. Spot-check an affected competition page — no stray single-member teams
   named after participants.

## How candidates are identified (all conditions must hold)

- Team has **exactly one member**, and a `registration_stats` row exists for
  the same `(competitionId, participantId)`.
- Team name equals the participant's name.
- Team `createdAt` is within 60 seconds **before** the matching stats row
  (the old job created the team first, then the stat).
- Team has **no** `team_events`, `judging_scores`, `team_trainers`, or
  `team_drone_access`.

These guards ensure real teams are never matched. Teams the job failed to
link (stats row without a team) are harmless leftovers in
`registration_stats` and are intentionally kept.

## Script

`scripts/cleanup-bulk-register-teams.ts` — dry-run by default; `--commit`
performs the deletion.
