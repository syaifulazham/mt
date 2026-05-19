# Phase 1 Blueprint — Foundation & Auth
> Techlympics Competition Management Platform — New Build  
> Target: Working organizer + manager auth with proper project scaffold

---

## Scope

Phase 1 delivers a **runnable skeleton** with all structural decisions locked in so Phase 2 feature work can begin without architectural rework.

**Deliverables:**
- Next.js 15 project scaffolded with correct folder structure
- PostgreSQL schema (Phase 1 tables) + Prisma 6 client
- Organizer auth (Auth.js v5 — email/password + optional TOTP)
- Manager auth (Clerk — Google OAuth + magic link)
- Unified middleware (route-group-aware, no double auth)
- Organizer portal shell (login, dashboard, user management stub)
- Manager portal shell (sign-in, dashboard stub, contingent creation stub)
- Docker Compose for local development
- CI scaffold (GitHub Actions: lint + typecheck on push)

**Out of scope for Phase 1:**
- Events, competitions, judging, quiz integration
- Participants and teams registration
- Email (Resend) — stubs only
- File storage (R2) — stubs only
- AI features

---

## 1. Folder Structure

```
/
├── src/
│   ├── app/
│   │   ├── (organizer)/              # Auth.js v5 session — staff only
│   │   │   ├── layout.tsx
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── users/                # SUPER_ADMIN + ADMIN only
│   │   │   │   └── page.tsx
│   │   │   └── invite/
│   │   │       └── [token]/
│   │   │           └── page.tsx      # First-login password setup
│   │   │
│   │   ├── (manager)/                # Clerk session — teachers/parents
│   │   │   ├── layout.tsx
│   │   │   ├── sign-in/
│   │   │   │   └── [[...sign-in]]/
│   │   │   │       └── page.tsx
│   │   │   ├── sign-up/
│   │   │   │   └── [[...sign-up]]/
│   │   │   │       └── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   └── onboarding/           # First-login: pick school/institution
│   │   │       └── page.tsx
│   │   │
│   │   ├── (judge)/                  # Phase 2 — stub only
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   │
│   │   ├── api/
│   │   │   └── v2/
│   │   │       ├── auth/
│   │   │       │   ├── [...nextauth]/
│   │   │       │   │   └── route.ts  # Auth.js v5 handler
│   │   │       │   ├── organizer/
│   │   │       │   │   ├── invite/
│   │   │       │   │   │   └── route.ts
│   │   │       │   │   └── users/
│   │   │       │   │       └── route.ts
│   │   │       │   └── judge/
│   │   │       │       └── route.ts  # Phase 2 stub
│   │   │       └── webhooks/
│   │   │           └── clerk/
│   │   │               └── route.ts  # Clerk user sync → manager_profiles
│   │   │
│   │   ├── layout.tsx                # Root layout (fonts, metadata)
│   │   └── page.tsx                  # Root redirect → /organizer/login or /manager/sign-in
│   │
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── auth.ts               # Auth.js v5 config (Credentials provider)
│   │   │   ├── session.ts            # getOrganizerSession() helper
│   │   │   └── permissions.ts        # Role → allowed routes map
│   │   ├── clerk.ts                  # Clerk server helpers
│   │   ├── db.ts                     # Prisma client singleton
│   │   ├── crypto.ts                 # AES-256-GCM helpers (TOTP secret enc/dec)
│   │   └── validations/
│   │       ├── organizer.ts          # Zod schemas for organizer forms
│   │       └── manager.ts            # Zod schemas for manager forms
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── organizer/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── TotpForm.tsx
│   │   │   └── Sidebar.tsx
│   │   └── manager/
│   │       ├── Sidebar.tsx
│   │       └── OnboardingForm.tsx
│   │
│   ├── middleware.ts                  # Unified route-group-aware auth middleware
│   └── types/
│       ├── next-auth.d.ts            # Augmented Session type
│       └── index.ts                  # Shared domain types
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                       # Seeds: SUPER_ADMIN, reference data
│
├── docker-compose.yml                # Local dev: postgres + redis
├── .env.local.example
├── .github/
│   └── workflows/
│       └── ci.yml                    # lint + typecheck on push
└── PHASE1_BLUEPRINT.md
```

---

## 2. Tech Stack — Phase 1 Packages

```json
{
  "dependencies": {
    "next": "15.x",
    "react": "19.x",
    "react-dom": "19.x",
    "@prisma/client": "^6.x",
    "next-auth": "^5.x",
    "@clerk/nextjs": "^6.x",
    "argon2": "^0.x",
    "zod": "^3.x",
    "otplib": "^12.x",
    "svix": "^1.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "lucide-react": "^0.x"
  },
  "devDependencies": {
    "prisma": "^6.x",
    "typescript": "^5.x",
    "@types/node": "^22.x",
    "@types/react": "^19.x",
    "eslint": "^9.x",
    "prettier": "^3.x"
  }
}
```

**shadcn/ui** components installed via CLI (not a package dependency):
`Button, Input, Label, Form, Card, Badge, Avatar, DropdownMenu, Separator, Toaster`

---

## 3. Database — Phase 1 Schema

Only the tables needed for auth and reference data. Everything else added in Phase 2.

### 3.1 Prisma Schema Highlights

```prisma
// Auth — Organizer (Auth.js v5)
model OrganizerUser {
  id                    String    @id @default(cuid())
  email                 String    @unique
  name                  String
  passwordHash          String
  role                  OrganizerRole @default(VIEWER)
  totpSecretEnc         String?
  totpEnabled           Boolean   @default(false)
  forcePasswordChange   Boolean   @default(true)
  isActive              Boolean   @default(true)
  inviteToken           String?   @unique
  inviteExpiresAt       DateTime?
  lastLoginAt           DateTime?
  createdById           String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  deletedAt             DateTime?

  // Auth.js v5 required relations
  sessions              OrganizerSession[]
  accounts              OrganizerAccount[]
}

enum OrganizerRole {
  SUPER_ADMIN
  ADMIN
  OPERATOR
  PARTICIPANTS_MANAGER
  JUDGE_COORDINATOR
  VIEWER
}

// Auth — Manager (Clerk-managed identity, synced via webhook)
model ManagerProfile {
  id                    String    @id @default(cuid())
  clerkUserId           String    @unique
  email                 String    @unique
  name                  String
  phone                 String?
  idType                IdType?
  idNumber              String?
  nationality           String?
  institutionType       InstitutionType?
  schoolId              String?
  higherInstitutionId   String?
  countryId             String?
  profileComplete       Boolean   @default(false)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  school                School?              @relation(fields: [schoolId], references: [id])
  higherInstitution     HigherInstitution?   @relation(fields: [higherInstitutionId], references: [id])
  country               Country?             @relation(fields: [countryId], references: [id])
  contingentManagers    ContingentManager[]
  participants          Participant[]        @relation("RegisteredBy")
}

enum IdType     { IC PASSPORT }
enum InstitutionType { SCHOOL HIGHER INDEPENDENT INTERNATIONAL }

// ── Reference Data ──────────────────────────────────────────────────────────
model Country {
  id          String   @id @default(cuid())
  name        String
  codeIso2    String   @unique @db.Char(2)
  codeIso3    String   @unique @db.Char(3)
  isActive    Boolean  @default(true)

  states      State[]
  managers    ManagerProfile[]
  contingents Contingent[]
}

model State {
  id         String   @id @default(cuid())
  name       String
  code       String   @unique
  countryId  String
  country    Country  @relation(fields: [countryId], references: [id])

  zones      Zone[]
  schools    School[]
  higherInstitutions HigherInstitution[]
  contingents Contingent[]
  events     Event[]
}

model Zone {
  id       String   @id @default(cuid())
  name     String
  stateId  String
  state    State    @relation(fields: [stateId], references: [id])

  districts District[]
  schools   School[]
  contingents Contingent[]
  events    Event[]
}

model District {
  id     String   @id @default(cuid())
  name   String
  zoneId String
  zone   Zone     @relation(fields: [zoneId], references: [id])

  schools School[]
}

model School {
  id          String        @id @default(cuid())
  name        String
  code        String        @unique
  ppdCode     String?
  stateId     String
  zoneId      String?
  districtId  String?
  level       SchoolLevel
  category    SchoolCategory
  isActive    Boolean       @default(true)

  state       State         @relation(fields: [stateId], references: [id])
  zone        Zone?         @relation(fields: [zoneId], references: [id])
  district    District?     @relation(fields: [districtId], references: [id])
  contingents Contingent[]
  managers    ManagerProfile[]
}

model HigherInstitution {
  id       String   @id @default(cuid())
  name     String
  code     String?  @unique
  stateId  String?
  isActive Boolean  @default(true)

  state       State?         @relation(fields: [stateId], references: [id])
  contingents Contingent[]
  managers    ManagerProfile[]
}

enum SchoolLevel    { PRIMARY SECONDARY SPECIAL }
enum SchoolCategory {
  KEBANGSAAN KEBANGSAAN_CINA KEBANGSAAN_TAMIL AGAMA TEKNIK SPORT PRIVATE LAIN_LAIN
}

// ── Contingents (stub — full relations added Phase 2) ────────────────────────
model Contingent {
  id                   String          @id @default(cuid())
  name                 String
  contingentType       ContingentType
  schoolId             String?
  higherInstitutionId  String?
  countryInvitationId  String?
  stateId              String?
  zoneId               String?
  countryId            String?
  status               ContingentStatus @default(ACTIVE)
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  school               School?          @relation(fields: [schoolId], references: [id])
  higherInstitution    HigherInstitution? @relation(fields: [higherInstitutionId], references: [id])
  state                State?           @relation(fields: [stateId], references: [id])
  zone                 Zone?            @relation(fields: [zoneId], references: [id])
  country              Country?         @relation(fields: [countryId], references: [id])
  managers             ContingentManager[]
}

model ContingentManager {
  id           String            @id @default(cuid())
  contingentId String
  managerId    String
  role         ContingentManagerRole @default(MANAGER)
  createdAt    DateTime          @default(now())

  contingent   Contingent        @relation(fields: [contingentId], references: [id])
  manager      ManagerProfile    @relation(fields: [managerId], references: [id])

  @@unique([contingentId, managerId])
}

enum ContingentType        { SCHOOL HIGHER INDEPENDENT INTERNATIONAL }
enum ContingentStatus      { ACTIVE SUSPENDED }
enum ContingentManagerRole { OWNER MANAGER }

// ── Auth.js v5 adapter tables ────────────────────────────────────────────────
model OrganizerSession {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         OrganizerUser @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model OrganizerAccount {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  user              OrganizerUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}
```

### 3.2 Phase 1 Seed Data
- 1 × `OrganizerUser` with role `SUPER_ADMIN` (password set via `AUTH_SEED_PASSWORD` env)
- All 14 Malaysian states
- `Country` row for Malaysia (`MY`)
- Sample schools CSV import script

---

## 4. Auth Implementation

### 4.1 Auth.js v5 — Organizer

**File**: `src/lib/auth/auth.ts`

```
Credentials provider flow:
  1. POST /api/v2/auth/[...nextauth] (signIn)
  2. Validate email + password (Argon2id verify)
  3. If totpEnabled: return partial session {totpPending: true}
     redirect → /organizer/totp
  4. If !forcePasswordChange: issue full session JWT with {id, role, email}
  5. If forcePasswordChange: redirect → /organizer/change-password
```

Session JWT payload:
```typescript
{
  id: string
  email: string
  name: string
  role: OrganizerRole
  totpPending?: boolean
}
```

### 4.2 Clerk — Manager

**Setup:**
- Install `@clerk/nextjs`
- Wrap `(manager)` layout in `<ClerkProvider>`
- `(organizer)` layout does NOT use ClerkProvider — keep isolated
- Clerk webhook at `POST /api/v2/webhooks/clerk` syncs user → `manager_profiles`

**Webhook events handled:**
- `user.created` → create `ManagerProfile`
- `user.updated` → update email/name in `ManagerProfile`
- `user.deleted` → soft-delete `ManagerProfile`

### 4.3 Middleware — Unified

**File**: `src/middleware.ts`

```
Route matching logic:
  /organizer/* → verify Auth.js session (getToken())
    - No session → redirect /organizer/login
    - Has session, totpPending → redirect /organizer/totp
    - forcePasswordChange → redirect /organizer/change-password
    - role check against PERMISSION_MAP

  /manager/* → verify Clerk session (auth())
    - No session → redirect /manager/sign-in
    - profileComplete=false → redirect /manager/onboarding

  /judge/* → verify JWT in Authorization header (Phase 2, stub)

  /api/v2/organizer/* → same as /organizer/* but return 401 JSON
  /api/v2/manager/* → same as /manager/* but return 401 JSON
  /api/v2/webhooks/* → no auth (signature verified in route handler)
```

---

## 5. Organizer Portal — Phase 1 Pages

| Page | Route | Access |
|------|-------|--------|
| Login | `/organizer/login` | Public |
| TOTP verification | `/organizer/totp` | Partial session |
| Change password | `/organizer/change-password` | forcePasswordChange flag |
| Invite accept | `/organizer/invite/[token]` | Valid invite token |
| Dashboard | `/organizer/dashboard` | Any organizer role |
| Users | `/organizer/users` | SUPER_ADMIN, ADMIN |

**Dashboard stub**: Shows logged-in user name, role badge, nav sidebar (links greyed out for Phase 2 items).

**Users page**: List of `OrganizerUser` records, invite button (POST `/api/v2/auth/organizer/users`), role badge, active/inactive toggle. Full CRUD — this is needed to provision Phase 2 operators.

---

## 6. Manager Portal — Phase 1 Pages

| Page | Route | Access |
|------|-------|--------|
| Sign in | `/manager/sign-in` | Public (Clerk) |
| Sign up | `/manager/sign-up` | Public (Clerk) |
| Onboarding | `/manager/onboarding` | Clerk session, profileComplete=false |
| Dashboard | `/manager/dashboard` | Clerk session, profileComplete=true |

**Onboarding flow:**
1. Select institution type: School / Higher Institution / Independent / International
2. If School: searchable select from `schools` dataset
3. If Higher: searchable select from `higher_institutions`
4. Enter phone number, ID type (IC/Passport), ID number
5. Submit → sets `profileComplete = true`, creates first `Contingent`

**Dashboard stub**: Shows manager name, contingent card (name, type, school/institution), "Add Contingent" button (Phase 2).

---

## 7. API Routes — Phase 1

```
POST   /api/v2/auth/[...nextauth]          Auth.js handler
POST   /api/v2/auth/organizer/users        Create organizer user (ADMIN+), send invite email
GET    /api/v2/auth/organizer/users        List organizer users (ADMIN+)
PATCH  /api/v2/auth/organizer/users/[id]   Update role / active status (SUPER_ADMIN)
POST   /api/v2/auth/organizer/invite/[tok] Accept invite, set password
POST   /api/v2/webhooks/clerk              Clerk user lifecycle webhook
GET    /api/v2/reference/states            Public — for onboarding dropdowns
GET    /api/v2/reference/schools           Public — searchable by name/code
GET    /api/v2/reference/higher-institutions  Public — searchable
```

---

## 8. Environment Variables

```env
# Database
DATABASE_URL=postgresql://techlympics:secret@localhost:5432/techlympics_dev

# Auth.js v5 (Organizer)
AUTH_SECRET=                        # openssl rand -base64 32
AUTH_TOTP_KEY=                      # openssl rand -base64 32 (AES-256 key for TOTP enc)
AUTH_SEED_PASSWORD=                 # Initial SUPER_ADMIN password (dev only)

# Clerk (Manager)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=               # From Clerk dashboard webhook signing

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Email (stub for Phase 1 — just log to console)
RESEND_API_KEY=re_stub
```

---

## 9. Docker Compose — Local Dev

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: techlympics_dev
      POSTGRES_USER: techlympics
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

---

## 10. CI — GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
```

---

## 11. Acceptance Criteria

Phase 1 is **done** when:

- [ ] `docker compose up` + `npm run dev` boots the app with no errors
- [ ] `SUPER_ADMIN` can log in at `/organizer/login` with seeded credentials
- [ ] TOTP enroll + verify works end-to-end
- [ ] `SUPER_ADMIN` can invite a new organizer user by email
- [ ] Invited user follows link, sets password, logs in with correct role
- [ ] Role-based middleware blocks wrong-role users with redirect (not 500)
- [ ] A teacher can sign up at `/manager/sign-up` via Google OAuth
- [ ] Clerk webhook fires, `ManagerProfile` row is created in DB
- [ ] Teacher completes onboarding (selects school, fills profile)
- [ ] Teacher sees dashboard with their contingent card
- [ ] `/organizer/*` routes are completely inaccessible from a Clerk session
- [ ] `/manager/*` routes are completely inaccessible from an Auth.js session
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes with zero warnings

---

## 12. Build Order

1. **Scaffold** — `create-next-app`, install packages, configure `tsconfig`, `eslint`, `prettier`
2. **Docker** — `docker-compose.yml`, `.env.local.example`, bring up postgres
3. **Prisma** — write `schema.prisma`, `prisma migrate dev`, seed SUPER_ADMIN + reference data
4. **Auth.js** — config, credentials provider, session type augmentation
5. **Clerk** — install, `ClerkProvider` in manager layout, webhook handler
6. **Middleware** — unified `src/middleware.ts`
7. **Organizer pages** — login → TOTP → dashboard → users CRUD
8. **Manager pages** — sign-in → onboarding → dashboard
9. **API routes** — organizer user management, reference data
10. **CI** — GitHub Actions workflow
