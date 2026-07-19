# Walk-in Judging Endpoints — Management Page

## Goal
Create the organizer page at `/organizer/events/[slug]/manage/walkin/judging` to create and manage **judging endpoints** (routeSlug + passcode) for walk-in competitions. Each endpoint targets one walk-in competition + one of its assigned judging templates. This is the walk-in analogue of the team-based `JudgingTask` flow in `EventJudgingClient`.

## Scope (confirmed)
- **In scope:** Prisma model + migration, organizer management page (server + client component), and the minimal CRUD API the page needs.
- **Out of scope (explicit follow-up):** the public walk-in judging board, score-saving API, participant-based score model, and any results/leaderboard view. The endpoints created here currently have no consumer — that is intentional and accepted.

## Key decisions (confirmed)
1. **New dedicated model** `WalkInJudgingEndpoint` (do **not** extend `WalkInEndpoint`, do **not** reuse team-based `JudgingTask`/`JudgingScore`). Rationale: `JudgingTask.eventCompetitionId` is a non-null FK to `EventCompetition` (a different table from walk-in `EventWalkInCompetition`) and `JudgingScore` is keyed on `teamId`; walk-in judging is participant-based, so a clean separate model is required and consistent with how the codebase already separates `EventCompetitionJudgingTemplate` vs `EventWalkInCompetitionJudgingTemplate`.
2. **One endpoint = one competition + one assigned template** (mirrors `JudgingTask`). Multiple endpoints per (competition, template) are allowed (e.g. multiple counters/rounds). No compound unique constraint.
3. **No "general" judging endpoints.** Judging requires a specific template bound to a specific competition, so every endpoint must reference a `walkInCompetitionId` (non-null) + `judgingTemplateId` (non-null). This differs from registration `WalkInEndpoint` which allows `walkInCompetitionId = null`.
4. **Passcode format:** 6 uppercase alphanumeric chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (matches `JudgingTask.genPasscode`). **Slug:** `randomBytes(10).toString("hex")` (matches `JudgingTask.genSlug`).
5. **Page UX:** left sidebar of walk-in competitions (same mental model as `WalkInManageClient`); right pane groups endpoints under each assigned template with a table per template (same rows/affordances as `EventJudgingClient` `TaskRow`: URL copy/open, passcode reveal/copy, status badge, toggle ACTIVE/CLOSED, delete) + a per-template "Cipta Endpoint" action.

## Files to create / modify

### 1. Schema — `prisma/schema.prisma`
Add new enum + model (place near the other walk-in models, e.g. after `WalkInEndpoint` ~line 623):

```prisma
enum WalkInJudgingEndpointStatus {
  ACTIVE
  CLOSED
}

model WalkInJudgingEndpoint {
  id                  String                      @id @default(cuid())
  eventId             String
  walkInCompetitionId String
  judgingTemplateId   String
  routeSlug           String                      @unique
  passcode            String
  label               String?
  status              WalkInJudgingEndpointStatus @default(ACTIVE)
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt

  event             Event                  @relation(fields: [eventId],             references: [id], onDelete: Cascade)
  walkInCompetition EventWalkInCompetition @relation(fields: [walkInCompetitionId], references: [id], onDelete: Cascade)
  judgingTemplate   JudgingTemplate        @relation(fields: [judgingTemplateId],   references: [id], onDelete: Cascade)

  @@index([walkInCompetitionId])
  @@map("walkin_judging_endpoints")
}
```

Add the required Prisma back-relation fields (one line each):
- `model Event` → `walkInJudgingEndpoints WalkInJudgingEndpoint[]`
- `model EventWalkInCompetition` (after `endpoints`/`judgingTemplates`, ~line 603) → `judgingEndpoints WalkInJudgingEndpoint[]`
- `model JudgingTemplate` (after `walkInCompetitions`, ~line 842) → `walkInJudgingEndpoints WalkInJudgingEndpoint[]`

Then generate the migration:
```
npm run db:migrate -- --name add_walkin_judging_endpoints
```

### 2. API routes (mirror `judging-tasks` routes exactly; auth via `getOrganizerSession`, `WRITE_ROLES = ["SUPER_ADMIN","ADMIN"]`)

Create `src/app/api/v2/organizer/events/[id]/walkin/[wicId]/judging-endpoints/route.ts`:
- `GET`: verify wic belongs to event; return `{ data: endpoints }` where endpoints = `db.walkInJudgingEndpoint.findMany({ where: { walkInCompetitionId: wicId }, include: { judgingTemplate: { select: { id, name, code } } }, orderBy: { createdAt: "asc" } })`, selecting `id, routeSlug, passcode, label, status, createdAt`.
- `POST`: body `{ judgingTemplateId, label? }`; verify wic belongs to event; verify template is assigned to this wic via `db.eventWalkInCompetitionJudgingTemplate.findUnique({ where: { walkInCompetitionId_judgingTemplateId: { walkInCompetitionId: wicId, judgingTemplateId } } })` → else `400 TEMPLATE_NOT_ASSIGNED`; generate unique slug + passcode; create with `eventId` resolved from the wic; return `{ data: endpoint }` (201).

Create `src/app/api/v2/organizer/events/[id]/walkin/[wicId]/judging-endpoints/[endpointId]/route.ts`:
- `PATCH`: body `{ label?, status? }`; find endpoint by id scoped to `walkInCompetitionId: wicId, walkInCompetition: { eventId }`; update + return `{ data: endpoint }` (include `judgingTemplate`).
- `DELETE`: same scoping; delete; return `{ success: true }`.

### 3. Server page — `src/app/(organizer)/organizer/events/[slug]/manage/walkin/judging/page.tsx`
Mirror `src/app/(organizer)/organizer/events/[slug]/manage/walkin/page.tsx`:
- `getOrganizerSession()` → redirect `/organizer/login` if absent.
- Load event by `slug`, select: `id, name, slug`, and `walkInCompetitions` (orderBy `createdAt asc`) each with: `id`, `competition { id, code, name }`, `_count { registrations }`, `judgingTemplates { include: { judgingTemplate: { select: { id, name, code, description, _count: { criterions } } } } }`, and `judgingEndpoints { select: { id, routeSlug, passcode, label, status, createdAt, judgingTemplate: { select: { id, name, code } } }, orderBy: { createdAt: "asc" } }`.
- Render `OrganizerShell` + `<WalkInJudgingManageClient event={...} canWrite={["SUPER_ADMIN","ADMIN"].includes(session.role)} />`.
- `metadata.title = "Walk-in Penghakiman"`.

### 4. Client component — `src/components/organizer/events/WalkInJudgingManageClient.tsx`
Compose patterns from `WalkInManageClient.tsx` (sidebar + endpoint rows w/ reveal/copy) and `EventJudgingClient.tsx` (template-grouped endpoint table + create dialog + status toggle).

State/shape:
- `type EndpointItem = { id, routeSlug, passcode, label: string|null, status: "ACTIVE"|"CLOSED", createdAt, judgingTemplate: { id, name, code } }`
- `type AssignedTpl = { judgingTemplate: { id, name, code, description, _count: { criterions } } }`
- `type WicBlock = { id, competition: { id, code, name }, _count: { registrations }, judgingTemplates: AssignedTpl[], judgingEndpoints: EndpointItem[] }`

UI:
- Header with back link to `/organizer/events/[slug]/manage/walkin` (ArrowLeft).
- Left sidebar: one button per walk-in competition (active = teal highlight, matching `WalkInManageClient`); show competition name, code, registration count.
- Right pane for the selected competition:
  - If competition has **no assigned templates**: empty state with a link to `/organizer/events/[slug]/manage/walkin` to assign templates first.
  - Otherwise, for each assigned template render a section (Gavel icon + name + code + criteria count) containing:
    - "Cipta Endpoint" button (write-only) → opens a small dialog (optional label input) → `POST .../judging-endpoints` with `{ judgingTemplateId }`; on success append to that template's endpoint list. Auto-generated URL/passcode shown after creation.
    - A table of endpoints for that template (reuse `EventJudgingClient.TaskRow` affordances): Label · Template code · URL (`/walkin-judging/{routeSlug}` — see note) with copy + open-in-new-tab · Passcode reveal/copy · Status badge · write-only Toggle (PATCH `status`) + Delete (DELETE).
- Reuse the copy/reveal helpers (clipboard + `revealedIds` Set) from `WalkInManageClient`.
- Optimistic local state updates on create/toggle/delete (mirror `EventJudgingClient` handlers).

**URL display note:** There is no consumer route yet (out of scope). Display the slug path as `/walkin-judging/{routeSlug}` (a placeholder for the future board) and disable/hide the "open" external link, or render it as plain copyable text only. Do **not** link to `/judging/{routeSlug}` (that is the team board and will 404/reject these slugs). Document this clearly in a code comment-free manner via a tooltip "Papan penghakiman akan tersedia kemudian".

## Conventions to follow (from existing code)
- All API errors: `{ error: "CODE" }` with the listed status codes; success lists use `{ data: ... }`.
- Auth + roles identical to sibling routes (`getOrganizerSession`, `WRITE_ROLES`).
- No code comments unless requested by existing file style (these files use none).
- Malay UI strings to match neighboring pages (e.g. "Cipta Endpoint", "Kembali", "Tiada template").

## Edge cases / risks
- **Unassigning a template after endpoints exist:** endpoints reference `JudgingTemplate` directly (not the assignment table), so they persist and remain functional for future scoring; only the "Cipta Endpoint" button for that template disappears. This matches `JudgingTask` behavior — acceptable and consistent.
- **Cascades:** deleting a walk-in competition or template cascades to its endpoints (good). Deleting an event cascades (good).
- **Slug uniqueness:** `routeSlug @unique` is global; the create handler retries on collision (mirror `judging-tasks` `while` loop).
- **`prisma generate`:** `postinstall` regenerates the client; after schema edit, run migrate (which also generates).

## Validation
1. `npm run db:migrate -- --name add_walkin_judging_endpoints` succeeds; `WalkInJudgingEndpoint` available on the Prisma client.
2. `npm run typecheck` passes.
3. `npm run lint` passes.
4. `npm run dev` → visit `/organizer/events/event-trial-2/manage/walkin/judging`:
   - Sidebar lists the event's walk-in competitions.
   - Selecting a competition with assigned templates shows template sections; "Cipta Endpoint" creates a row with a generated URL + passcode; reveal/copy works; toggle ACTIVE↔CLOSED persists on reload; delete removes the row.
   - Competition with no assigned templates shows the assign-first empty state.

## Open / follow-up (out of scope here)
- Public walk-in judging board (passcode entry → participant list from `WalkInRegistration` → score entry) + `WalkInJudgingScore` model keyed on `(walkInJudgingEndpointId, walkInRegistrationId, criterionId)`.
- Results/leaderboard view for walk-in judging.
