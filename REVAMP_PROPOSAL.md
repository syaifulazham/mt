# MT25 — Total Revamp Proposal

> Prepared: 2026-05-02  
> Target: Techlympics 2025+ Competition Management Platform

---

## Executive Summary

The current system is a functional but organically-grown platform with 60+ tables, 395+ API endpoints, dual-track authentication that is partially coupled, and no clear domain boundaries. This proposal recommends a ground-up rebuild using a cleaner architecture, a properly normalised database, a unified but role-aware auth system, and deep AI integration across judging, participant matching, content generation, and analytics.

**Key architectural decision**: Quiz delivery is handled by a **separate commercial quiz application** that Malaysia Techlympics subscribes to. The main platform manages participant registration, question banks (with AI), and stores results returned by the provider. The quiz provider owns everything else — delivery, timing, scoring.

---

## 1. Current Pain Points

| Area     | Issue                                                                                                                                                         |
| ----------| ---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Auth     | Two separate auth flows (organizer vs participant) share the same NextAuth config but diverge in callbacks — fragile and hard to extend                       |
| Auth     | Judge login is passcode-only with no real session management                                                                                                  |
| Auth     | Arena/quiz login uses a raw hashcode mechanism outside NextAuth — this will be retired; participant access to quizzes is managed by the external quiz provider |
| Auth     | Attendance endpoints use yet another passcode system                                                                                                          |
| Database | 60+ tables with minimal foreign key discipline, JSON blobs for config, duplicated fields across models                                                        |
| Database | No audit trail (created_by, updated_by, deleted_at) on most tables                                                                                            |
| Database | `referencedata` used as a catch-all dump                                                                                                                      |
| API      | 395+ routes with inconsistent patterns — some REST, some RPC-style, many duplicates for organizer/participant views of the same resource                      |
| AI       | Only two AI features (question generation, translation) using GPT-3.5-turbo; no streaming, no caching, no fallback                                            |
| Code     | `TypeScript build errors ignored`, ESLint warnings suppressed — technical debt accumulating silently                                                          |

---

## 2. Proposed Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | **Next.js 15 (App Router)** | Already on App Router; upgrade for React 19 Suspense/Actions |
| Database | **PostgreSQL + Prisma 6** | Better JSON support, row-level security (RLS), native enums, better full-text search, pgvector for AI embeddings |
| Auth | **Auth.js v5 (formerly NextAuth)** + **Clerk** for manager portal | Auth.js for organizer/staff; Clerk for social login, OTP, magic link on manager side |
| Cache / Queue | **Upstash Redis** (serverless) | Session cache, rate limiting, AI response caching, job queues |
| File Storage | **Cloudflare R2** (or AWS S3) | Certificates, uploads, gallery — off server, CDN-delivered |
| AI | **Vercel AI SDK** + **Claude claude-sonnet-4-6** | Streaming, tool use, structured output, prompt caching |
| Email | **Resend** | Reliable deliverability, React Email templates, webhooks for open/click |
| Real-time | **Pusher / Ably** | Live judging scores, attendance updates; quiz leaderboard is the provider's concern |
| Quiz Provider Integration | **Subscription API key + Webhooks (TBD)** | Platform pushes participants to provider; provider returns results |
| PDF | **React PDF (pdf-lib + @react-pdf/renderer)** | Type-safe certificate generation |
| Monitoring | **Sentry + Posthog** | Error tracking + product analytics |

---

## 3. Authentication — Complete Redesign

### 3.1 Identity Model

There is **one organizer** — **Malaysia Techlympics** — with multiple staff users operating at different permission levels. The system is not multi-tenant on the organizer side; every organizer user belongs to the same organisation.

There are four distinct **actor types** total. Each has a different auth UX but all resolve to a single `Identity` record.

> **Key distinction**: The people who **log in** to the manager portal are **managers** (teachers, parents, lecturers) — not the competition participants themselves. Competition participants (students/youth) are registered *by* their manager and have no login of their own.

```
Identity
  ├── id (uuid)
  ├── email (unique)
  ├── email_verified_at
  ├── created_at
  └── actor_type: ORGANIZER | MANAGER | JUDGE | ATTENDANCE_AGENT
        ↓
  OrganizerProfile  — Malaysia Techlympics staff, role-based access
  ManagerProfile    — Teachers / parents / lecturers who manage contingents & participants
  JudgeProfile      — Assigned per competition, passcode-based
  AttendanceAgent   — Endpoint-scoped, passcode-based
```

> **Participants** (the students/youth who actually compete) are **not** identity records. They are data records in the `participants` table, created and managed by their manager. They have no login.

**Organizer role hierarchy** (single org, multiple permission levels):

| Role | Access |
|------|--------|
| `SUPER_ADMIN` | Full system access, user management, system config |
| `ADMIN` | All event/competition/participant management, cannot manage other admins |
| `OPERATOR` | Create/edit events, competitions, quizzes, judging templates |
| `PARTICIPANTS_MANAGER` | Manage contingents, participants, teams only |
| `JUDGE_COORDINATOR` | Manage judges and judging sessions only |
| `VIEWER` | Read-only access across all modules |

This means **one `organizer_users` table**, not a multi-tenant organisation model. Role diverges at the profile layer, not at the auth layer.

### 3.2 Organizer Auth (Malaysia Techlympics Staff)

**Method**: Email + password with optional TOTP 2FA.

All organizer users are **Malaysia Techlympics staff** — no self-registration, no public sign-up. Accounts are provisioned by a `SUPER_ADMIN` or `ADMIN` only.

- Use **Auth.js v5 Credentials provider** with Argon2id password hashing.
- On first login, force password change (`force_password_change = true` is set on account creation).
- TOTP secret stored encrypted in `organizer_users.totp_secret_enc` (AES-256-GCM).
- Session: JWT cookie, 8-hour expiry, sliding window.
- The `role` claim in the JWT is the sole authority for permission checks — no database hit per request.
- **Account provisioning**: `SUPER_ADMIN` or `ADMIN` creates a user account directly in the admin panel (sets name, email, role). A system-generated invite email is sent with a one-time setup link (signed JWT, 24h TTL) to set their password.
- **No self-service role escalation** — only `SUPER_ADMIN` can promote a user to `ADMIN`.

```
POST /api/auth/organizer/login
POST /api/auth/organizer/totp/verify
POST /api/auth/organizer/invite/accept    (first-time password setup)
POST /api/auth/organizer/password/reset   (forgot password)
```

**Permission matrix** (enforced in middleware by role claim):

| Route prefix              | SUPER_ADMIN | ADMIN   | OPERATOR | PARTICIPANTS_MANAGER | JUDGE_COORDINATOR | VIEWER |
| ---------------------------| :-----------:| :-------:| :--------:| :--------------------:| :-----------------:| :------:|
| `/organizer/users`        | ✓           | limited | —        | —                    | —                 | —      |
| `/organizer/events`       | ✓           | ✓       | ✓        | —                    | —                 | read   |
| `/organizer/competitions` | ✓           | ✓       | ✓        | —                    | —                 | read   |
| `/organizer/participants` | ✓           | ✓       | ✓        | ✓                    | —                 | read   |
| `/organizer/judging`      | ✓           | ✓       | ✓        | —                    | ✓                 | read   |
| `/organizer/quizzes`      | ✓           | ✓       | ✓        | —                    | —                 | read   |
| `/organizer/certificates` | ✓           | ✓       | ✓        | —                    | —                 | read   |
| `/organizer/system`       | ✓           | —       | —        | —                    | —                 | —      |

### 3.3 Manager Auth (Teachers / Parents / Lecturers)

**Method**: Google OAuth + Magic Link email + optional phone OTP.

The manager portal is used by **teachers, parents, and lecturers** who register and manage competition participants on behalf of their school, institution, or group. They are not competition participants themselves.

- Use **Clerk** for manager-facing auth:
  - Pre-built components (SignIn, SignUp, UserButton) with full customisation.
  - Handles Google OAuth, magic link, phone OTP in one SDK.
  - Webhooks to sync `ManagerProfile` into your own database on user creation/update.
  - Clerk's `sessionToken` validated in API routes via `@clerk/nextjs/server`.
- When a manager logs in for the first time via Google, the system auto-creates `ManagerProfile` and prompts them to select their school/institution and create or join a contingent.
- Clerk manages **manager identities only** — organizer staff are not in Clerk; they use Auth.js with the `organizer_users` table. This keeps the two user pools cleanly separated.

**Why Clerk for managers?**  
Managers include school teachers who may use personal Google accounts. Clerk's magic link + social login UX requires no password management and handles email verification, rate limiting, and bot protection out of the box.

### 3.4 Judge Auth

**Method**: Passcode + Event PIN (two-factor, no account creation required).

Judges are typically ad-hoc and don't need persistent accounts. The flow:

1. Organizer creates a `JudgeEndpoint` record with a generated 6-digit PIN and a per-judge passcode hash.
2. Judge visits `/judge/login`, enters their passcode + the event PIN.
3. Server validates, issues a short-lived **signed JWT** (4-hour TTL) with claims `{ actor: JUDGE, endpoint_id, competition_id }`.
4. Token stored in `sessionStorage` (not cookies) — expires when browser closes.
5. All judge API routes verify this JWT via middleware without touching the database.

```
POST /api/auth/judge/login   { passcode, event_pin } → { token }
```

### 3.5 Quiz Provider — Participant Access

How participants access the quiz provider's platform is determined by the **provider's product**, not by this platform. The known part of the flow is that the manager pushes participant records to the provider in advance (see Section 8.2). How the provider authenticates those participants to take the quiz (redirect, login, passcode, etc.) will be defined in the integration agreement.

**What this platform must provide regardless of provider choice**:
- A clear UI entry point in the manager portal showing which participants have been pushed.
- A record of which participants have been synced to the provider (`quiz_participant_sync`).
- A place to display results once the provider returns them (`quiz_results`).

> Full auth/redirect flow to be documented once the quiz provider's API is available.

### 3.6 Attendance Agent Auth

Same pattern as Arena — endpoint ID + passcode → short-lived JWT. No change in UX, just cleanly isolated.

### 3.7 Unified Middleware

Single `middleware.ts` that reads the JWT from either the Auth.js cookie or the `Authorization: Bearer` header and resolves the actor type:

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const actor = await resolveActor(request); // checks cookie, then Bearer token
  
  if (!actor && isProtectedRoute(request.pathname)) {
    return redirectToLogin(request);
  }
  
  // Attach actor to request headers for downstream consumption
  const headers = new Headers(request.headers);
  headers.set('x-actor', JSON.stringify(actor));
  return NextResponse.next({ request: { headers } });
}
```

---

## 4. Database — Redesign Principles

### 4.1 Core Principles

1. **PostgreSQL over MySQL** — use `uuid` primary keys (not auto-increment), native `enum` types, `jsonb` for flexible config, `pgvector` for AI embeddings.
2. **Soft deletes everywhere** — `deleted_at timestamptz` on all mutable entities.
3. **Full audit trail** — `created_by uuid`, `updated_by uuid`, `created_at`, `updated_at` on every table.
4. **No catch-all tables** — replace `referencedata` with typed tables or proper `jsonb` config on the entities that need it.
5. **Row-Level Security** — use PostgreSQL RLS policies to enforce read-only access for `VIEWER` role and scope `PARTICIPANTS_MANAGER` queries to their assigned events at the DB level. Since there is only one organizer (Malaysia Techlympics), RLS is for role scoping, not tenant isolation.

### 4.2 Revised Schema (Key Tables)

```sql
-- Core identity
identities (id, email, email_verified_at, actor_type, created_at, deleted_at)

-- Malaysia Techlympics staff (single organizer, multiple roles)
organizer_users (id, identity_id FK,
                 full_name, phone,
                 role ENUM(SUPER_ADMIN|ADMIN|OPERATOR|PARTICIPANTS_MANAGER|JUDGE_COORDINATOR|VIEWER),
                 totp_secret_enc,
                 force_password_change bool DEFAULT true,
                 is_active bool DEFAULT true,
                 last_login_at,
                 provisioned_by FK → organizer_users.id,
                 …audit cols)

-- Managers are the people who LOG IN (teachers, parents, lecturers).
-- They register and manage participants on behalf of their contingent.
-- They do NOT compete — they are administrators of their group.
manager_profiles (id, identity_id FK, full_name, phone,
                  id_type ENUM(IC|PASSPORT),
                  id_number varchar,
                  nationality varchar,
                  institution_type ENUM(SCHOOL|HIGHER|INDEPENDENT|INTERNATIONAL),
                  school_id FK,
                  higher_institution_id FK,
                  country_id FK,
                  verified_at)

-- Geography — Malaysian
countries (id, name, code_iso2, code_iso3, is_active)
                      -- seeded with all countries; is_active controls what appears in dropdowns

states (id, name, code, country_id FK DEFAULT 'MY')
zones (id, name, state_id FK)
districts (id, name, zone_id FK)

-- Schools dataset (source of truth for Malaysian school contingents)
-- Contingents of type SCHOOL must reference a record here — no free-text school names.
schools (id, name, code, ppd_code,
         state_id FK, zone_id FK, district_id FK,
         level ENUM(PRIMARY|SECONDARY|SPECIAL),
         category ENUM(KEBANGSAAN|KEBANGSAAN_CINA|KEBANGSAAN_TAMIL|AGAMA|TEKNIK|SPORT|PRIVATE|…),
         is_active bool)

higher_institutions (id, name, code, state_id FK, is_active bool)

-- International contingent source (invited countries)
-- Organizer creates an invitation; invited country then registers their contingent under it.
country_invitations (id, country_id FK, event_id FK,
                     invited_by FK → organizer_users.id,
                     invitation_code varchar UNIQUE,  -- shared with the country's coordinator
                     max_contingents int DEFAULT 1,
                     status ENUM(PENDING|ACCEPTED|DECLINED|REVOKED),
                     accepted_at, notes,
                     …audit cols)

-- Competitions
themes (id, name, slug, description, icon_url, is_active)

-- Malaysian school grade enum — declared in ascending order so PostgreSQL
-- enum comparison operators (< > BETWEEN) work correctly for range matching.
-- Darjah 1–6  → primary school (Sekolah Rendah)
-- Tingkatan 1–5 → secondary school (Sekolah Menengah)
-- Tingkatan 6  → upper secondary / pre-university; may fall under SEKOLAH_MENENGAH
--               or BELIA depending on how the organizer configures target groups
CREATE TYPE school_grade AS ENUM (
  'DARJAH_1', 'DARJAH_2', 'DARJAH_3', 'DARJAH_4', 'DARJAH_5', 'DARJAH_6',
  'TINGKATAN_1', 'TINGKATAN_2', 'TINGKATAN_3', 'TINGKATAN_4', 'TINGKATAN_5',
  'TINGKATAN_6'
);

-- Target groups — ADMIN-configurable global parameter.
-- Defines fine-grained eligibility bands within each competition section.
-- ADMIN can add, rename, or archive target groups without code changes.
target_groups (id, name varchar,
               section ENUM(SEKOLAH_RENDAH|SEKOLAH_MENENGAH|BELIA),
               match_by ENUM(GRADE|AGE),
                              -- GRADE: auto-assign using grade_min/grade_max (school_grade type)
                              --        correct for school sections — a Tingkatan 1 student
                              --        could be 12 or 14; age is unreliable
                              -- AGE:   auto-assign using age_min/age_max (integer years)
                              --        correct for BELIA where there is no grade structure
               grade_min school_grade, -- populated when match_by = GRADE
               grade_max school_grade,
               age_min int,            -- populated when match_by = AGE
               age_max int,
               description text,
               is_active bool DEFAULT true,
               sort_order int,
               …audit cols)

-- Seed examples:
-- name                   section            match_by  grade_min      grade_max       age_min  age_max
-- 'Darjah 1–3'           SEKOLAH_RENDAH     GRADE     DARJAH_1       DARJAH_3
-- 'Darjah 4–6'           SEKOLAH_RENDAH     GRADE     DARJAH_4       DARJAH_6
-- 'Tingkatan 1–3'        SEKOLAH_MENENGAH   GRADE     TINGKATAN_1    TINGKATAN_3
-- 'Tingkatan 4–5'        SEKOLAH_MENENGAH   GRADE     TINGKATAN_4    TINGKATAN_5
-- 'Tingkatan 6'          SEKOLAH_MENENGAH   GRADE     TINGKATAN_6    TINGKATAN_6
--   (or under BELIA if organizer treats T6 as youth — configurable)
-- 'Diploma'              BELIA              AGE                                       18       22
-- 'Ijazah / Degree'      BELIA              AGE                                       18       25
-- 'Belia Umum'           BELIA              AGE                                       18       30

competitions (id, theme_id FK, name, slug,
              competition_type ENUM(QUIZ|CODING|STRUCTURE_BUILDING|POSTER|…),
              participation_mode ENUM(INDIVIDUAL|TEAM),
              judging_method ENUM(AI|JURY|POINT_SCORE|TIME_COMPLETION),
              max_team_size, min_team_size,
              config jsonb,
              created_by FK, …audit cols)

event_competitions (id, event_id FK, competition_id FK,
                    status ENUM(DRAFT|OPEN|IN_PROGRESS|COMPLETED),
                    …audit cols)

-- Competition ↔ target group mapping (many-to-many).
-- A competition can be open to multiple target groups across one or more sections.
-- Registration is blocked if the participant's assigned target group is not in this list.
competition_target_groups (id, competition_id FK, target_group_id FK,
                            max_participants_per_contingent int,
                            UNIQUE (competition_id, target_group_id))

events (id, name, slug, 
        scope ENUM(NATIONAL|ZONE|STATE|DISTRICT|OPEN|ONLINE),
        state_id FK, zone_id FK,
        registration_open_at, registration_close_at,
        event_start_at, event_end_at,
        venue, venue_address, venue_lat, venue_lng,
        banner_url, is_published,
        …audit cols)

event_competitions (id, event_id FK, competition_id FK, 
                    max_participants_per_contingent,
                    status ENUM(DRAFT|OPEN|IN_PROGRESS|COMPLETED),
                    …audit cols)

-- Contingents & Teams
--
-- A contingent represents one institution's or country's delegation.
-- contingent_type determines which FK is populated and what validation rules apply:
--
--   SCHOOL       → school_id must reference a verified record in the schools dataset
--   HIGHER       → higher_institution_id must reference higher_institutions
--   INDEPENDENT  → no institution FK; name is free-text
--   INTERNATIONAL → country_invitation_id must reference an accepted country_invitations record
--
contingents (id,
             name varchar NOT NULL,
                          -- SCHOOL: auto-populated from school.name (not editable)
                          -- HIGHER: free-text group name chosen by registrant, must be
                          --         unique within the same higher_institution_id + event
                          --         (e.g. "Fakulti Kejuruteraan", "Kelab Robotik")
                          -- INDEPENDENT / INTERNATIONAL: free-text
             contingent_type ENUM(SCHOOL|HIGHER|INDEPENDENT|INTERNATIONAL),
             school_id FK,                   -- required when type = SCHOOL
             higher_institution_id FK,       -- required when type = HIGHER
             country_invitation_id FK,       -- required when type = INTERNATIONAL
             state_id FK,                    -- null for INTERNATIONAL
             zone_id FK,                     -- null for INTERNATIONAL
             country_id FK,                  -- null for domestic; set for INTERNATIONAL
             status ENUM(ACTIVE|SUSPENDED),
             …audit cols)

-- Uniqueness enforced at DB level:
-- UNIQUE (school_id, event_id) WHERE contingent_type = 'SCHOOL'
-- UNIQUE (higher_institution_id, name, event_id) WHERE contingent_type = 'HIGHER'

-- Links managers (who log in) to the contingents they manage
contingent_managers (id, contingent_id FK, manager_id FK → manager_profiles.id,
                     role ENUM(OWNER|MANAGER))

teams (id, event_competition_id FK, contingent_id FK, name,
       status ENUM(DRAFT|SUBMITTED|APPROVED|DISQUALIFIED),
       evidence_url, notes,
       …audit cols)

team_members (id, team_id FK, participant_id FK, role ENUM(LEADER|MEMBER))

-- Participants are the people who COMPETE.
-- They have no login — they are registered and managed by a manager.
participants (id, contingent_id FK,
              registered_by FK → manager_profiles.id,
              full_name,
              id_type ENUM(IC|PASSPORT),
              id_number varchar,
              dob,
              grade school_grade,          -- nullable for INTERNATIONAL / BELIA participants
                                           -- with no school grade structure
              nationality varchar,         -- ISO 3166-1 alpha-2
              race ENUM(MELAYU|CINA|INDIA|ORANG_ASLI_SEMENANJUNG|
                        BUMIPUTRA_SABAH|BUMIPUTRA_SARAWAK|LAIN_LAIN),
                                           -- nullable for international participants
              gender ENUM(MALE|FEMALE),
              is_ppki bool DEFAULT false,  -- Pendidikan Khas Integrasi; nullable for international
              section ENUM(SEKOLAH_RENDAH|SEKOLAH_MENENGAH|BELIA),
                                           -- top-level competition division (auto-derived)
              target_group_id FK,          -- specific band within section (auto-derived;
                                           -- overridable by Participants Manager)
              status ENUM(ACTIVE|INACTIVE|BANNED),
              …audit cols)

-- Judging
--
-- A competition may have multiple judging templates (e.g. KERETA ROKET has
-- "Performance" + "Design" templates). Each template contributes a weighted
-- portion to the team's final score.
--
-- template_weight is the percentage contribution of this template to the
-- final score. All active templates for a competition must sum to 100.
-- e.g. Performance = 60, Design = 40 → final = (perf_score × 0.6) + (design_score × 0.4)
--
judging_templates (id, competition_id FK,
                   name varchar,             -- e.g. "Performance", "Design", "Presentation"
                   template_weight decimal,  -- contribution to final score (0–100); all
                                            -- templates for a competition must sum to 100
                   version int,
                   is_active bool,
                   …audit cols)

judging_criteria (id, template_id FK, name, description,
                  weight decimal,            -- weight within this template (criteria sum to 100)
                  max_score decimal,
                  score_type ENUM(POINTS|TIME|DISCRETE|BINARY),
                  rubric jsonb,              -- AI-generated rubric stored here
                  order int)

-- A judging session is scoped to ONE template for ONE team.
-- For a competition with 2 templates, each team will have 2 sessions
-- (possibly with different judges assigned per template).
judging_sessions (id, event_competition_id FK,
                  template_id FK,            -- which template this session scores
                  judge_id FK,
                  team_id FK,                -- moved here — a session is per team+template
                  status ENUM(PENDING|IN_PROGRESS|SUBMITTED|APPROVED),
                  started_at, submitted_at, notes)

judging_scores (id, session_id FK, criteria_id FK,
                score decimal, notes text,
                ai_suggested_score decimal,
                ai_confidence decimal,
                …audit cols)

-- Stores the computed score per template per team (materialised after all
-- sessions for a template are APPROVED). Used to build the final result.
judging_template_results (id, event_competition_id FK, template_id FK, team_id FK,
                           raw_score decimal,        -- sum of criteria scores
                           normalised_score decimal, -- raw_score / max_possible × 100
                           weighted_score decimal,   -- normalised_score × template_weight / 100
                           is_final bool DEFAULT false,
                           …audit cols)

results (id, event_competition_id FK, team_id FK, participant_id FK,
         rank int,
         total_score decimal,                -- sum of all weighted_scores across templates
         score_breakdown jsonb,              -- { "Performance": 54.0, "Design": 38.5 }
         medal ENUM(GOLD|SILVER|BRONZE|NULL),
         is_published bool, …audit cols)

-- Question Bank (Techlympics-owned, AI-assisted, provider-agnostic)
question_bank (id, text text, alt_text text, language varchar,
               answer_type ENUM(SINGLE|MULTIPLE|BINARY),
               difficulty ENUM(EASY|MEDIUM|HARD),
               topic varchar, subtopic varchar,
               options jsonb,            -- [{ id, text, is_correct }]
               explanation text,         -- AI-generated explanation
               status ENUM(DRAFT|APPROVED|ARCHIVED),
               embedding vector(1536),   -- pgvector for semantic search & dedup
               quality_score decimal,    -- AI quality review score (0–1)
               quality_flags jsonb,      -- AI review notes
               metadata jsonb,
               …audit cols)

-- Quiz Provider Integration (structure TBD — see Section 8)
-- These tables track what Techlympics pushes to and receives from the provider.

quiz_participant_sync (
  id uuid PK,
  event_competition_id FK,
  participant_id FK,
  provider_ref varchar,          -- ID assigned by quiz provider after registration
  push_status ENUM(PENDING|SYNCED|FAILED),
  pushed_at timestamptz,
  last_error text,
  …audit cols
)

quiz_results (
  id uuid PK,
  event_competition_id FK,
  participant_id FK,
  provider_session_ref varchar,  -- provider's session/attempt ID
  score decimal,
  max_score decimal,
  passed bool,
  completed_at timestamptz,
  raw_payload jsonb,             -- full result payload from provider, preserved verbatim
  …audit cols
)

-- NOTE: Quiz delivery, timing, question-level answers, and session state
-- are entirely managed by the quiz provider. This platform only stores
-- the participant push log and the aggregate results returned by the provider.

-- Certificates
cert_templates (id, name, type ENUM(…), event_id FK,
                config jsonb,   -- layout, fonts, positions
                template_url, preview_url,
                is_active bool, …audit cols)

certificates (id, template_id FK, 
              recipient_type ENUM(CONTESTANT|TEAM|CONTINGENT|SCHOOL),
              recipient_id uuid,
              serial_number varchar UNIQUE,
              issued_at, revoked_at,
              metadata jsonb,  -- name, competition, rank, etc.
              pdf_url, verification_code uuid UNIQUE)

-- AI Features
ai_interactions (id, actor_id FK, actor_type,
                 feature ENUM(QUESTION_GEN|TRANSLATION|RUBRIC_GEN|SCORE_SUGGEST|CHATBOT|…),
                 model varchar, prompt_tokens int, completion_tokens int,
                 cached bool, latency_ms int,
                 input jsonb, output jsonb,
                 created_at)
```

### 4.3 Contingent Model — Rules & Validation

#### Contingent types and their constraints

| Type | School FK | Higher FK | Country Invitation FK | Free-text name | Multiple per event | ID type | Race field | Section |
|------|:---------:|:---------:|:--------------------:|:---------------:|:-----------------:|:-------:|:----------:|:-------:|
| `SCHOOL` | **Required** | — | — | — | **No** — one per school | IC | Required | Auto-derived |
| `HIGHER` | — | **Required** | — | ✓ | **Yes** — unlimited groups | IC | Required | `BELIA` always |
| `INDEPENDENT` | — | — | — | ✓ | Yes | IC | Required | Manual |
| `INTERNATIONAL` | — | — | **Required** | ✓ | Bounded by invitation | Passport | Nullable | Manual |

#### Competition sections and target groups (two-layer model)

**Section** is the top-level competition division — structural, fixed, driven by the participant's education stage. **Target group** is the fine-grained eligibility band within a section — configurable by ADMIN with no code changes required.

```
Section (fixed enum)
  └── Target Groups (ADMIN-configurable table)
        └── Contestant is assigned both
        └── Contest declares which target groups it accepts
```

| Section | Who qualifies | Section derivation |
|---------|---------------|--------------------|
| `SEKOLAH_RENDAH` | Primary school students | `school.level = PRIMARY` |
| `SEKOLAH_MENENGAH` | Secondary school students | `school.level = SECONDARY` |
| `BELIA` | Youth / post-secondary | `contingent_type = HIGHER` always; or manual for INDEPENDENT / INTERNATIONAL |

**Target groups** are seeded by ADMIN and can be extended at any time:

| Target group | Section | match_by | grade_min → grade_max / age range |
|---|---|:---:|---|
| Darjah 1–3 | SEKOLAH_RENDAH | GRADE | `DARJAH_1` → `DARJAH_3` |
| Darjah 4–6 | SEKOLAH_RENDAH | GRADE | `DARJAH_4` → `DARJAH_6` |
| Tingkatan 1–3 | SEKOLAH_MENENGAH | GRADE | `TINGKATAN_1` → `TINGKATAN_3` |
| Tingkatan 4–5 | SEKOLAH_MENENGAH | GRADE | `TINGKATAN_4` → `TINGKATAN_5` |
| Tingkatan 6 | SEKOLAH_MENENGAH *or* BELIA | GRADE | `TINGKATAN_6` → `TINGKATAN_6` |
| Diploma | BELIA | AGE | 18–22 |
| Ijazah / Degree | BELIA | AGE | 18–25 |
| Belia Umum | BELIA | AGE | 18–30 |

> **Tingkatan 6 placement** — Tingkatan 6 students are still in secondary school but some competitions treat them as Belia. The organizer configures this by placing the `Tingkatan 6` target group under either `SEKOLAH_MENENGAH` or `BELIA` in the admin panel — no code change needed.

**Why `match_by = GRADE` for schools** — a Tingkatan 1 student could be 12 or 14 depending on their schooling history. Age-based matching would misclassify them. The `school_grade` enum stores the Malaysian label directly (`DARJAH_1`, `TINGKATAN_3`, etc.) so the match is exact and readable with no magic number mapping.

**Auto-derivation logic:**
```sql
-- GRADE-based (school_grade enum — comparison uses enum declaration order)
SELECT id FROM target_groups
WHERE match_by = 'GRADE'
  AND section   = :participant_section
  AND grade_min <= :participant_grade      -- e.g. TINGKATAN_1
  AND grade_max >= :participant_grade
LIMIT 1;

-- AGE-based
SELECT id FROM target_groups
WHERE match_by = 'AGE'
  AND section   = 'BELIA'
  AND age_min   <= :age_at_event_date
  AND age_max   >= :age_at_event_date
LIMIT 1;
```

For `SCHOOL` contingents, the system runs this check automatically on registration. For `HIGHER` contingents, section is always `BELIA` and the matching BELIA target group is resolved by age. For `INDEPENDENT` and `INTERNATIONAL`, both are set manually by the Participants Manager.

**Registration guard** — a participant can only register for a competition if their `target_group_id` appears in `competition_target_groups`. Checking section alone is not sufficient.

**Override** — `PARTICIPANTS_MANAGER` and above can override both `section` and `target_group_id` after registration (e.g. a gifted primary student competing at secondary level by special arrangement).

#### PPKI status

`is_ppki` (Pendidikan Khas Integrasi) flags participants enrolled in the special needs integration programme. It is:

- A **boolean field** on `participants`, defaulting to `false`.
- **Nullable** for international participants (the concept is Malaysia-specific).
- Surfaced in the organizer dashboard for reporting, attendance, and accommodation planning.
- **Does not automatically restrict or grant competition access** — PPKI participants compete under the same target group rules. Competition-level PPKI accommodations (extra time, alternative formats) are handled through competition `config jsonb`, not by gating registration.
- Included in certificate metadata and result exports for national reporting purposes.

---

#### School contingent validation

A participant registering a school contingent **cannot type a free-text school name**. They must search and select from the `schools` dataset. This prevents duplicates (e.g. "SMK Taman Melawati" vs "SMKTM") and ensures state/zone/district are correctly inherited.

- Search is by school name or code (`ppd_code`), filtered by state.
- If a school is missing from the dataset, the participant must contact the Participants Manager to have it added — not bypass the lookup.
- One school can only have **one active contingent per event**. A second registration attempt for the same `school_id` + `event_id` is rejected.

#### International contingent flow

```
Organizer creates country_invitation
  { country_id, event_id, max_contingents, invitation_code }
        │
        ▼
Organizer shares invitation_code with the country's coordinator
(out-of-band: email, WhatsApp, etc.)
        │
        ▼
Country coordinator visits registration page,
enters invitation_code → system validates and shows event/competition details
        │
        ▼
Coordinator creates contingent (type = INTERNATIONAL)
  linked to country_invitation_id
        │
        ▼
Coordinator registers participants with:
  - Passport number (not IC)
  - Nationality (from countries table)
  - School/institution name (free-text — no dataset constraint)
        │
        ▼
Contingent appears in organizer dashboard under "International Contingents"
with country flag, separate from domestic listing
```

#### One contingent per school, unlimited per higher institution

```sql
-- Schools: strictly one active contingent per event
UNIQUE (school_id, event_id)   -- for SCHOOL contingents only
```

Higher institutions are **not** subject to this constraint. A single university or polytechnic can register multiple contingents (e.g. by faculty, club, or programme) for the same event. Each contingent must have a **distinct name** chosen by the registrant — the institution name alone is not sufficient.

Examples of valid higher institution contingents at the same event:
```
Universiti Malaya — Fakulti Kejuruteraan
Universiti Malaya — Kelab Robotik
Universiti Malaya — Team Alpha
```

The `higher_institution_id` is retained on the contingent for reporting and grouping in the organizer dashboard (e.g. "all contingents from UM"), but it is not a uniqueness key.

International contingents are bounded by `country_invitations.max_contingents` per event.

---

### 4.4 Multi-Template Judging Model

A competition can have **one or more judging templates**, each covering a different aspect of the competition. Each template carries a weight that defines its percentage contribution to the team's final score. All template weights for a competition must sum to 100.

**Example — Kereta Roket:**

| Template | Weight | Criteria |
|----------|:------:|---------|
| Performance | 60% | Speed (40%), Completion (30%), Consistency (30%) |
| Design | 40% | Creativity (50%), Build Quality (30%), Theme Compliance (20%) |

**Score computation flow:**

```
For each team:

  Template score (per template)
    = Σ (criteria_score × criteria_weight / 100)

  Normalised score
    = template_score / template_max_score × 100

  Weighted score
    = normalised_score × template_weight / 100

  Final score
    = Σ weighted_scores across all templates

Example:
  Performance raw: 42/50  → normalised: 84  → weighted: 84 × 0.60 = 50.4
  Design raw:      36/50  → normalised: 72  → weighted: 72 × 0.40 = 28.8
  Final score: 50.4 + 28.8 = 79.2
```

**Session model:**

Each `judging_session` is scoped to **one template + one team**. A competition with 2 templates and 10 teams produces 20 sessions. Different judges can be assigned to different templates (e.g. an engineer judges Performance, an artist judges Design).

```
event_competition
  └── judging_sessions  (one per template per team)
        ├── template_id  ← "Performance"
        ├── team_id
        └── judge_id
              └── judging_scores  (one per criterion)
```

**Result materialisation:**

When all sessions for a template are `APPROVED`, the system computes `judging_template_results` (normalised + weighted score per template per team). The final `results` row is written once all templates are complete, with a `score_breakdown jsonb` showing the contribution of each template.

---

### 4.5 Dropped Tables

Replace these with proper structures:

| Old Table                  | Replacement                                                                    |
| ----------------------------| --------------------------------------------------------------------------------|
| `referencedata`            | Typed config in `jsonb` columns on relevant entities                           |
| `microsite`                | Contestant portal — just the participant dashboard filtered by `participant.id` |
| `attendanceagent_endpoint` | Merged into `attendance_endpoints` with `agent_type` discriminator             |
| `quiz_progression`         | Owned entirely by quiz provider — not stored in main platform                  |
| `quiz_attempt`             | Replaced by `quiz_results` (aggregate score from provider only)                |
| `quiz_answer`              | Owned entirely by quiz provider — not stored in main platform                  |
| `eventAttendanceSync`      | Replace with event-sourced log table                                           |
| `independent` (old)        | Folded into `contingents` with `contingent_type = INDEPENDENT`                 |

---

## 5. AI Features — Full Integration Plan

This is the biggest opportunity. Below are features grouped by implementation effort.

### 5.1 Already Exists (Upgrade Only)

| Feature             | Current                               | Proposed                                                                              |
| ---------------------| ---------------------------------------| ---------------------------------------------------------------------------------------|
| Question Generation | GPT-3.5-turbo, no streaming, no cache | Claude claude-sonnet-4-6, streamed UI, prompt caching, structured output via tool use |
| Translation         | GPT-3.5-turbo one-shot                | Claude claude-haiku-4-5 (fast + cheap), cached, supports 10+ languages                |

**Migration**: Switch to Vercel AI SDK with `streamText` and `generateObject` for structured outputs. Use **prompt caching** on system prompts (saves ~80% token cost on repeated generation calls).

### 5.2 New: AI Rubric Generator

When an organizer creates a `judging_template`, an AI assistant suggests criteria and rubric descriptions based on the competition type.

**Flow**:
1. Organizer inputs competition name, type, and target group.
2. AI returns structured `JudgingCriteria[]` with suggested weights, score types, and rubric descriptions per band (Excellent / Good / Satisfactory / Unsatisfactory).
3. Organizer can accept, edit, or regenerate individual criteria.
4. Rubric stored in `judging_criteria.rubric jsonb`.

**Model**: Claude claude-sonnet-4-6 with `generateObject` (Zod schema for type safety).

```typescript
const rubricSchema = z.object({
  criteria: z.array(z.object({
    name: z.string(),
    description: z.string(),
    weight: z.number().min(0).max(100),
    scoreType: z.enum(['POINTS', 'TIME', 'DISCRETE', 'BINARY']),
    maxScore: z.number(),
    bands: z.array(z.object({
      label: z.string(),
      minScore: z.number(),
      maxScore: z.number(),
      description: z.string(),
    })),
  })),
});
```

### 5.3 New: AI Judge Assistance (Score Suggestion)

During judging, the AI analyses a team's submission evidence (PDF, image, video transcript) and suggests a score per criterion with reasoning.

**Flow**:
1. Team uploads evidence at registration.
2. Before judging session starts, AI processes the evidence and generates `ai_suggested_score` per criterion.
3. Judge sees the suggested score with reasoning as a side-panel hint — they are free to override.
4. System tracks human vs AI delta for analytics.

**Model**: Claude claude-sonnet-4-6 with vision (for images/PDFs) + tool use for structured score output.

**Data stored in**: `judging_scores.ai_suggested_score`, `judging_scores.ai_confidence`.

### 5.4 New: AI Question Quality Reviewer

Before questions are approved and made available for use in a quiz competition, an AI reviews them for:
- Clarity and unambiguity
- Difficulty calibration vs stated level
- Language correctness (BM/EN/ZH/TA)
- Duplicate detection (semantic similarity via `pgvector` embeddings)

**Flow**: After generation or manual entry, a background job scores each question. Questions below a quality threshold are flagged for organizer review before status is set to `APPROVED`. Embeddings stored in `question_bank.embedding vector(1536)`.

**Duplicate detection**: `SELECT * FROM question_bank ORDER BY embedding <=> $new_embedding LIMIT 5` — returns semantically similar questions before saving.

**Data stored in**: `question_bank.quality_score`, `question_bank.quality_flags jsonb`.

> Whether approved questions can be exported to the quiz provider is subject to the integration agreement — see Section 8.

### 5.5 Deferred: Adaptive Quiz Engine

An adaptive quiz engine (Computerised Adaptive Testing) would be a valuable feature — questions dynamically selected based on participant performance in real time. However, since the quiz delivery is handled by the **quiz provider** (not this platform), whether adaptive testing is supported depends entirely on the provider's product capabilities.

**Action**: Include adaptive quiz support as a **requirement** when evaluating or briefing the quiz provider (see Section 8.5).

### 5.6 New: Manager Chatbot (Competition Advisor)

A context-aware chatbot on the manager portal that can answer questions about:
- Eligible competitions for their participants' age group and school level
- Registration deadlines
- Team size requirements
- Past results and certificates

**Implementation**: Retrieval-Augmented Generation (RAG) using `pgvector`. Competition rules, FAQ, and announcements are chunked, embedded, and stored. On each query, relevant chunks are retrieved and passed as context to Claude.

**Endpoint**: Streamed response via `POST /api/chat` using Vercel AI SDK `streamText`.

### 5.7 New: AI-Powered Certificate Personalisation

When generating certificates, AI can generate a personalised achievement summary sentence based on the participant's performance data.

Example: *"Achieved 2nd place in Robotics Structure Building at the Selangor State Level with a score of 87.5 — demonstrating exceptional precision and teamwork."*

Stored in `certificates.metadata.ai_citation`.

### 5.8 New: Organizer Analytics Copilot

Natural language queries over the competition data. Organizer types: *"Show me contingents with low attendance at zone level events this year"* → AI generates the SQL (sandboxed read-only), executes it, and returns a chart.

**Implementation**: Claude tool use with a `executeReadOnlyQuery` tool that runs the SQL against a read replica with RLS preventing cross-event access.

### 5.9 New: AI Announcement & News Drafts

Organizer provides bullet points → AI expands into a bilingual (BM + EN) announcement draft. One-click publish after review.

**Model**: Claude claude-haiku-4-5 (fast, cheap for short-form content).

---

## 6. API Architecture — Cleanup

### 6.1 Pattern

Move from 395 ad-hoc routes to a consistent pattern:

```
/api/v2/[domain]/[resource]          GET (list), POST (create)
/api/v2/[domain]/[resource]/[id]     GET, PATCH, DELETE
/api/v2/[domain]/[resource]/[id]/[action]   POST (actions)
```

Examples:
```
GET    /api/v2/organizer/events
POST   /api/v2/organizer/events
GET    /api/v2/organizer/events/:id
PATCH  /api/v2/organizer/events/:id
POST   /api/v2/organizer/events/:id/publish

GET    /api/v2/manager/competitions
POST   /api/v2/manager/teams
GET    /api/v2/manager/teams/:id
PATCH  /api/v2/manager/teams/:id
POST   /api/v2/manager/teams/:id/submit

POST   /api/v2/ai/questions/generate    (streamed)
POST   /api/v2/ai/rubric/generate       (streamed)
POST   /api/v2/ai/chat                  (streamed)
POST   /api/v2/ai/translate
```

### 6.2 Shared Response Envelope

```typescript
type ApiResponse<T> = {
  data: T;
  meta?: { total: number; page: number; per_page: number; };
  error?: { code: string; message: string; details?: unknown };
};
```

### 6.3 Rate Limiting

All AI endpoints and auth endpoints rate-limited via **Upstash Redis** + `@upstash/ratelimit`:
- Auth: 5 attempts per IP per minute
- AI generation: 20 requests per organizer per hour
- Translation: 100 requests per user per hour

---

## 7. Real-Time Features

Add **Pusher** (or Ably) for:

| Feature | Channel | Event |
|---------|---------|-------|
| Live judging scores | `competition:{id}` | `score.updated` |
| Quiz leaderboard | `quiz:{id}` | `leaderboard.updated` |
| Attendance check-in | `event:{id}:attendance` | `participant.checked_in` |
| Judge submission | `session:{id}` | `session.submitted` |
| AI generation progress | `user:{id}` | `generation.progress` |

---

## 8. Quiz Provider — Subscription Integration

The quiz system is a **separate commercial product** developed and operated independently of the Techlympics platform. Malaysia Techlympics **subscribes** to this quiz service. The Techlympics platform does not own, host, or build the quiz application.

> **Status**: Integration spec is a placeholder. Full API contract will be defined once the quiz provider's product is available. This section documents what is known now and what needs to be agreed with the provider.

---

### 8.1 Relationship Model

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│   Techlympics Platform       │        │   Quiz Provider (SaaS)       │
│   (Subscriber / Customer)    │        │   (Independent Product)      │
│                              │        │                              │
│  • Manages participants       │──────▶ │  • Receives participant list  │
│  • Manages events/contests   │  push  │  • Registers participants    │
│  • Owns question bank (AI)   │        │  • Delivers quiz sessions    │
│  • Issues certificates       │ ◀───── │  • Returns scores/results    │
│  • Rankings & results        │results │                              │
└──────────────────────────────┘        └──────────────────────────────┘
```

Techlympics authenticates to the quiz provider using a **subscription API key** issued upon sign-up. All calls from the platform to the provider include this key.

---

### 8.2 Known Workflow (Confirmed)

The one integration workflow confirmed so far:

**Participant push — Participants Manager → Quiz Provider**

```
Participants Manager assigns a quiz competition to an event
        │
        ▼
Participants Manager selects the list of registered participants
for that event competition
        │
        ▼
Platform calls quiz provider API:
  POST {QUIZ_PROVIDER_URL}/api/participants
  Authorization: Bearer <SUBSCRIPTION_API_KEY>
  Body: [
    {
      "external_id": "<participant_id>",   ← Techlympics participant UUID
      "name": "Ahmad bin Ali",
      "ic_number": "XXXXXX-XX-XXXX",     ← used as unique identifier
      "contest_ref": "<quiz_contest_ref>",
      "group": "secondary"
    },
    …
  ]
        │
        ▼
Quiz provider registers participants in their own database
        │
        ▼
Platform records push status in quiz_participant_sync table
```

The `external_id` (Techlympics participant UUID) is the link between both systems — the provider must include it in any result payload so Techlympics can match scores back to the right participant.

---

### 8.3 What Needs to Be Defined (TBD with Provider)

The following will be specified once the quiz provider's API is available:

| Item | Notes |
|------|-------|
| Participant push API endpoint & payload format | Provider defines this |
| Authentication mechanism (API key, OAuth, etc.) | Provider defines this |
| How results are returned (webhook vs polling) | Prefer webhook; provider decides |
| Result payload structure | Must include `external_id` for matching |
| How quiz sessions are launched (redirect URL, embed, etc.) | Provider defines this |
| Whether Techlympics question bank can be imported | TBD — provider may have their own question format |
| Participant update / removal handling | TBD |
| Rate limits and bulk push limits | TBD |

---

### 8.4 Platform-Side Integration Table (Database)

Regardless of what the provider's API looks like, the platform needs to track push status and results:

```sql
-- Tracks each participant push to the quiz provider
quiz_participant_sync (
  id uuid PK,
  event_competition_id FK,
  participant_id FK,
  provider_ref varchar,          -- ID assigned by quiz provider after registration
  push_status ENUM(PENDING|SYNCED|FAILED),
  pushed_at timestamptz,
  last_error text,
  …audit cols
)

-- Stores results received back from the quiz provider
quiz_results (
  id uuid PK,
  event_competition_id FK,
  participant_id FK,
  provider_session_ref varchar,  -- provider's session/attempt ID
  score decimal,
  max_score decimal,
  passed bool,
  completed_at timestamptz,
  raw_payload jsonb,             -- full result payload from provider, preserved as-is
  …audit cols
)
```

`raw_payload` stores the provider's full response verbatim — this protects against schema changes on the provider side and preserves evidence for disputes.

---

### 8.5 Design Constraints for the Provider (To Negotiate)

When evaluating or briefing the quiz provider, Techlympics should request:

1. **`external_id` passthrough** — Techlympics' participant UUID must be echoed back in every result.
2. **Webhook delivery** — results pushed to Techlympics immediately on completion, not polling.
3. **Bulk participant registration** — at least 500 participants per batch call.
4. **Idempotent push** — re-pushing the same `external_id` + `contest_ref` should update, not duplicate.
5. **Result finality flag** — a clear `is_final: true` field so partial/in-progress scores are not accidentally processed.
6. **SLA** — result webhook delivered within 30 seconds of quiz completion.

---

> **This section will be replaced with the full integration spec once the quiz provider's API documentation is available.**

---

## 9. Email — Upgrade to Resend + React Email

Replace the current SMTP + template system with:

1. **Resend** as the sending provider (reliable, good Malaysian deliverability, webhooks).
2. **React Email** for type-safe, reusable email templates.
3. **Upstash QStash** for queuing bulk campaign sends (current system sends synchronously).
4. Webhook receiver for open/click tracking (already tracked in `email_outgoing`, just improve reliability).

Template examples:
```
emails/
  invitation.tsx        (organizer invite)
  magic-link.tsx        (participant login)
  registration-confirm.tsx
  competition-reminder.tsx
  certificate-issued.tsx
  result-announcement.tsx
```

---

## 10. File Storage — Move to R2/S3

All uploads (certificates, evidence, gallery, templates) should leave the server filesystem:

- **Cloudflare R2** — zero egress cost, S3-compatible API.
- Presigned URLs for direct browser-to-storage upload (no server proxying).
- Certificates served via R2's public URL with a Cloudflare CDN in front.
- Images auto-optimised via Cloudflare Images (or Next.js `<Image>` with R2 remote pattern).

---

## 11. Phased Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–4)
- [ ] Set up PostgreSQL (Supabase or Neon for managed, or self-hosted)
- [ ] Write new Prisma schema (identity model, core tables with `quiz_sessions` integration table)
- [ ] Implement Auth.js v5 for organizers
- [ ] Implement Clerk for managers
- [ ] Build unified middleware
- [ ] Migrate existing data with transformation scripts

### Phase 2 — Core Features (Weeks 5–8)
- [ ] Rebuild organizer portal (events, competitions, participants, teams)
- [ ] Rebuild manager portal (registration, team management)
- [ ] Judge auth + judging session UI
- [ ] Attendance system
- [ ] Question bank management UI (AI generation, quality review, approve/archive workflow)

### Phase 3 — Quiz Provider Integration (Weeks 7–10, parallel with Phase 2)
- [ ] Finalise subscription agreement with quiz provider
- [ ] Build participant push UI (Participants Manager selects participants → push to provider)
- [ ] Implement `quiz_participant_sync` tracking table and push API call
- [ ] Implement result webhook receiver (`POST /api/v2/webhooks/quiz/result`)
- [ ] Display quiz status and results in manager portal
- [ ] End-to-end test: participant push → provider confirmation → result received → certificate trigger
- [ ] *(Full spec TBD based on provider's API documentation)*

### Phase 4 — AI Integration (Weeks 9–13)
- [ ] Migrate question generation to Vercel AI SDK + Claude (main platform)
- [ ] AI question quality reviewer + embedding pipeline (main platform)
- [ ] AI rubric generator (main platform)
- [ ] Participant chatbot — RAG (main platform)
- [ ] AI judge assistance — score suggestion (main platform)
- [ ] Evaluate quiz provider for adaptive quiz support (see Section 8.5)

### Phase 5 — Polish & Advanced (Weeks 13–16)
- [ ] Analytics copilot (main platform)
- [ ] Real-time judging/leaderboard (Pusher)
- [ ] React Email + Resend migration
- [ ] R2 file storage migration
- [ ] AI certificate personalisation

---

## 12. Environment Variables (New)

### Main Platform

```env
# Database
DATABASE_URL=postgresql://...
DATABASE_READ_URL=postgresql://...   # Read replica for analytics

# Auth — Organizer (Auth.js v5)
AUTH_SECRET=...
AUTH_TOTP_KEY=...                    # AES-256 key for TOTP secrets

# Auth — Participant (Clerk)
CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...

# Quiz Provider Integration (values provided by provider upon subscription)
QUIZ_PROVIDER_URL=...                # Base URL of the quiz provider's API
QUIZ_PROVIDER_API_KEY=...            # Subscription API key issued by provider
QUIZ_PROVIDER_WEBHOOK_SECRET=...     # Secret for verifying inbound result webhooks (TBD)

# AI
ANTHROPIC_API_KEY=...               # Claude (primary AI)
OPENAI_API_KEY=...                  # For embeddings (text-embedding-3-small)

# Cache / Queue
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
UPSTASH_QSTASH_TOKEN=...            # For email queuing

# Email
RESEND_API_KEY=...

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=...

# Real-time
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=...

# Monitoring
SENTRY_DSN=...
NEXT_PUBLIC_POSTHOG_KEY=...
```

*(No quiz app env block — the quiz provider is an external SaaS. Credentials above are issued by the provider.)*

---

## 13. Quick Wins (Can Do Now Without Full Revamp)

If a full rebuild is not immediately feasible, these fixes are high-impact and low-risk:

1. **Fix TypeScript/ESLint suppression** — Re-enable strict checks, fix actual errors. This reveals bugs.
2. **Consolidate the two user tables** — Merge `user` (organizers) and `user_participant` into a single `identities` table with role/type discriminator. Minimal schema migration, big clarity gain.
3. **Formalise organizer roles** — Add `JUDGE_COORDINATOR` as a distinct role; remove ambiguity between `OPERATOR` and `PARTICIPANTS_MANAGER` access scopes.
4. **Add `deleted_at` to key tables** — Soft delete for `contests`, `participants`, `teams`, `certificates`.
5. **Upgrade AI to Claude** — Swap `gpt-3.5-turbo` for `claude-haiku-4-5` in question generation and translation. Better quality, similar cost. Add prompt caching.
6. **Add rate limiting to AI routes** — Prevent API cost abuse.
7. **Fix judge auth** — Wrap passcode flows to issue proper signed JWTs consistently; the arena/quiz auth in the current codebase will be retired once the quiz provider integration is live.
8. **Move file uploads to R2/S3** — The certificate upload path is already customised in `next.config.js`; just point it to R2.
9. **Add audit columns** — `created_by`, `updated_by`, `deleted_at` via a Prisma middleware hook.

---

## 14. Deployment Strategy

### 14.1 Infrastructure Overview

```
                        Internet
                           │
                    ┌──────▼──────┐
                    │   Nginx     │  :80 / :443
                    │ (reverse    │  SSL termination
                    │  proxy)     │  Rate limiting
                    └──────┬──────┘
                           │
                   ┌───────▼────────┐
                   │  Main App      │
                   │  :3000         │
                   │  (Next.js)     │
                   └───────┬────────┘
                           │
           ┌───────────────▼───────────────┐
           │        PostgreSQL :5432        │
           │        Redis      :6379        │
           │   (internal network only)      │
           └───────────────────────────────┘

                  ↕  outbound API calls only
           ┌──────────────────────────────┐
           │  Quiz Provider (external     │
           │  SaaS — not hosted here)     │
           └──────────────────────────────┘
```

**Server recommendation**: Two VPS instances (or one large instance for staging, two for production):
- **App server**: 4 vCPU, 8 GB RAM — runs Nginx + Next.js app via Docker
- **DB server**: 4 vCPU, 16 GB RAM — runs PostgreSQL + Redis (internal network, never public)

Both apps run as Docker containers managed by **Docker Compose**, with Nginx as the public entry point.

---

### 14.2 Repository Structure

```
github.com/MalaysiaTechlympics/
  └── mt-platform/        ← main Next.js app (this repo)
```

The quiz provider is an external SaaS — it has no presence in this repository and no deployment managed by Techlympics.

---

### 14.3 Docker Setup

**`Dockerfile`** (same pattern for both apps):

```dockerfile
# Stage 1 — deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2 — builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3 — runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
```

**`docker-compose.yml`** (on the app server):

```yaml
services:

  mt-platform:
    image: ghcr.io/malaysiatechlympics/mt-platform:${PLATFORM_TAG:-latest}
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"   # only accessible via Nginx, not public
    env_file: /opt/mt/platform.env
    depends_on:
      - db
      - redis
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    env_file: /opt/mt/db.env

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

> **Note**: The app port is bound to `127.0.0.1` only — never directly reachable from the internet; all traffic goes through Nginx. The quiz provider is an external SaaS and is not deployed here.

---

### 14.4 Nginx Configuration

**Install & SSL**:

```bash
apt install nginx certbot python3-certbot-nginx
certbot --nginx -d mt.techlympics.my
```

**`/etc/nginx/sites-available/mt-platform`**:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m  rate=60r/m;
limit_req_zone $binary_remote_addr zone=ai:10m   rate=20r/m;

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name mt.techlympics.my;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mt.techlympics.my;

    ssl_certificate     /etc/letsencrypt/live/mt.techlympics.my/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mt.techlympics.my/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    client_max_body_size 20M;

    # Static assets — served from Next.js public dir via CDN cache hint
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Auth endpoints — strict rate limit
    location /api/auth/ {
        limit_req zone=auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/proxy_params;
    }

    # AI endpoints — per-user rate limit
    location /api/v2/ai/ {
        limit_req zone=ai burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/proxy_params;
        # Allow streaming responses (AI text/event-stream)
        proxy_buffering off;
        proxy_read_timeout 120s;
    }

    # Webhook receiver (quiz provider → main platform)
    location /api/v2/webhooks/ {
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/proxy_params;
    }

    # Everything else
    location / {
        limit_req zone=api burst=30 nodelay;
        proxy_pass http://127.0.0.1:3000;
        include /etc/nginx/proxy_params;
    }
}
```

**`/etc/nginx/proxy_params`**:

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_connect_timeout 10s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;
```

---

### 14.5 GitHub Actions — CI Workflow

**`.github/workflows/ci.yml`** (runs on every PR and push to `main`):

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run type-check     # add "type-check": "tsc --noEmit" to package.json

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: mt_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/mt_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: [lint-and-type-check]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run build
```

---

### 14.6 GitHub Actions — CD Workflow (Zero-Downtime Deploy)

**`.github/workflows/deploy.yml`** (runs on push to `main` only, after CI passes):

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false    # never cancel a deploy mid-flight

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
      short_sha: ${{ steps.sha.outputs.short }}
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Short SHA
        id: sha
        run: echo "short=${GITHUB_SHA::8}" >> $GITHUB_OUTPUT

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/malaysiatechlympics/mt-platform
          tags: |
            type=sha,prefix=,format=short
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            NEXT_PUBLIC_APP_URL=${{ vars.NEXT_PUBLIC_APP_URL }}

  deploy:
    runs-on: ubuntu-latest
    needs: build-and-push
    environment: production
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            set -e

            # Pull new image
            echo ${{ secrets.GITHUB_TOKEN }} | \
              docker login ghcr.io -u ${{ github.actor }} --password-stdin
            docker pull ghcr.io/malaysiatechlympics/mt-platform:${{ needs.build-and-push.outputs.short_sha }}

            # Run DB migrations before switching traffic
            docker run --rm \
              --env-file /opt/mt/platform.env \
              ghcr.io/malaysiatechlympics/mt-platform:${{ needs.build-and-push.outputs.short_sha }} \
              npx prisma migrate deploy

            # Zero-downtime swap: update image tag, rolling restart
            cd /opt/mt
            PLATFORM_TAG=${{ needs.build-and-push.outputs.short_sha }} \
              docker compose up -d --no-deps --wait mt-platform

            # Health check — fail deploy if app doesn't respond
            for i in $(seq 1 10); do
              if curl -sf http://localhost:3000/api/health; then
                echo "Health check passed"
                break
              fi
              if [ $i -eq 10 ]; then
                echo "Health check failed — rolling back"
                PLATFORM_TAG=previous \
                  docker compose up -d --no-deps mt-platform
                exit 1
              fi
              sleep 5
            done

            # Clean up old images (keep last 3)
            docker image prune -f \
              --filter "label=org.opencontainers.image.ref.name=ghcr.io/malaysiatechlympics/mt-platform" \
              --filter "until=72h"

      - name: Notify on failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: failure
          text: "Production deploy FAILED for mt-platform @ ${{ needs.build-and-push.outputs.short_sha }}"
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

> The quiz provider is external — no deploy workflow is needed for it.

---

### 14.7 Branch & Environment Strategy

```
main          → Production   (mt.techlympics.my)
develop       → Staging      (staging.techlympics.my)
feature/*     → No deploy    (CI only)
hotfix/*      → Manual deploy to production after approval
```

**Environments in GitHub** (`Settings → Environments`):
- `production` — requires manual approval from `SUPER_ADMIN` role, 2 required reviewers.
- `staging` — auto-deploy, no approval gate.

**Secrets stored in GitHub** (`Settings → Secrets`):

| Secret | Used by |
|--------|---------|
| `SERVER_HOST` | SSH deploy |
| `SERVER_USER` | SSH deploy |
| `SERVER_SSH_KEY` | SSH deploy |
| `SLACK_WEBHOOK` | Failure notifications |
| All `.env` values | Injected via `/opt/mt/platform.env` on server |

> `.env` files live only on the server at `/opt/mt/`. They are **never** in the repository and **never** in GitHub secrets (too large and rotatable independently). The deploy script reads them from disk.

---

### 14.8 Database Migration Safety

Migrations run **before** the new container takes traffic (see deploy script above). Rules:

| Migration type | Safe? | Notes |
|---|---|---|
| Add nullable column | Yes | Old app ignores it |
| Add column with default | Yes | Old app ignores it |
| Add index (CONCURRENTLY) | Yes | Non-blocking in PostgreSQL |
| Rename column | **No** | Use add → backfill → drop in 3 separate deploys |
| Drop column | **No** | Deprecate first, remove after old code is gone |
| Change column type | **No** | Use shadow column pattern |

Prisma migrations are checked into git. A failed migration aborts the deploy before the new container starts — old container keeps serving traffic.

---

### 14.9 SSL Certificate Auto-Renewal

Certbot renews automatically via a cron job installed by the package. Verify with:

```bash
systemctl status certbot.timer
# Force test:
certbot renew --dry-run
```

Add a post-renewal hook to reload Nginx without downtime:

```bash
# /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh
#!/bin/bash
systemctl reload nginx
```

---

### 14.10 Health Check Endpoint

Add this to the main platform. Nginx and Docker Compose both rely on it:

```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', ts: Date.now() });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
```

---

### 14.11 Rollback Procedure

**Automatic**: If the health check loop fails after deploy, the script immediately restarts the previous image tag (`PLATFORM_TAG=previous docker compose up -d`).

**Manual**:

```bash
# SSH into server
cd /opt/mt

# List available image tags
docker images ghcr.io/malaysiatechlympics/mt-platform

# Roll back to a specific SHA
PLATFORM_TAG=abc12345 docker compose up -d --no-deps mt-platform

# Verify
curl -s http://localhost:3000/api/health
```

---

### 14.12 Monitoring & Alerts

| Tool | Purpose | Trigger |
|------|---------|---------|
| **UptimeRobot** (free) | External uptime ping every 5 min | Alert to Slack + email if site is down |
| **Sentry** | Runtime error tracking | Alert on new error or spike |
| **Posthog** | Product analytics (organizer + participant activity) | — |
| **PostgreSQL `pg_stat_activity`** | Long-running query detection | Alert if query > 30s |
| **Nginx access log** | Request rate, 4xx/5xx rate | Parse with `goaccess` or forward to Loki |

---

*End of proposal. This document should be treated as a living specification — update section headings as decisions are made.*
