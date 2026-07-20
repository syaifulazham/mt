# Viblock Arena — REST API Guideline

The Viblock Arena backend exposes a REST API as a Supabase Edge Function at:

```
https://<project>.supabase.co/functions/v1/external-api
```

All endpoints are scoped to a single **event**, identified by an **API key** issued for that event. Keys are SHA-256 hashed and stored in the `event_api_keys` table; the raw key is presented by the client in the `X-API-Key` header on every request.

---

## 1. Authentication

Every request **must** include:

| Header | Required | Description |
| --- | --- | --- |
| `X-API-Key` | Yes | Raw (un-hashed) API key for the event |
| `Content-Type` | `application/json` | For request bodies on POST/PUT |

The function hashes the incoming key with SHA-256, looks up `event_api_keys.key_hash`, and verifies:

- `is_active = true`
- `expires_at` is null or in the future

On success, the resolved `event_id` scopes every subsequent query. A missing key returns `401`; an invalid/expired key returns `401`.

> The Edge Function uses the Supabase **service role** key server-side. Clients never see it. User-creation and sign-in use the admin and anon clients respectively, but always through this function — never directly.

---

## 2. Conventions

- **Base path:** `/functions/v1/external-api` — route paths below are relative to this (the function strips the `/external-api` prefix internally, so callers may use either form).
- **Methods:** `GET`, `POST`. Preflight `OPTIONS` is handled and returns the CORS headers.
- **CORS:** All responses include:
  ```
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key
  ```
- **Errors:** Always `4xx`/`5xx` with `{ "error": "<message>" }`. See status table below.
- **Success:** `200` or `201` with the JSON body documented per endpoint.

### Status codes

| Code | Meaning |
| --- | --- |
| `200` | Success (GET, POST that returns existing data) |
| `201` | Created (new user, sector, membership) |
| `400` | Malformed request / missing required field |
| `401` | Missing, invalid, or expired API key; invalid credentials |
| `403` | Authenticated user not assigned to a sector in this event |
| `404` | Referenced sector, user, or challenge not found |
| `409` | Duplicate (user exists, sector custom_id taken, member already assigned) |
| `500` | Internal server error |

---

## 3. Synthetic users

When a caller provides a `userid` instead of an `email`, the function synthesizes an email of the form:

```
<userid>@api.viblock.arena
```

This lets external systems register and authenticate participants by a stable local identifier without exposing real emails. Both forms (`email` or `userid`) are accepted on user-creation and token endpoints; exactly one must be supplied.

---

## 4. Endpoints

### 4.1 Users

#### POST `/users` — Register a participant

Creates an auth user scoped to this event's API key. The user is created with role `player` and email confirmation already on.

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `password` | string | yes | User's password |
| `email` | string | one of `email`/`userid` | Real email |
| `userid` | string | one of `email`/`userid` | Synthesized into `<userid>@api.viblock.arena` |
| `full_name` | string | no | Stored in `user_metadata.full_name` |

**Responses**

- `201` — `{ id, email, full_name, userid }`
- `409` — User already exists
- `400` — Missing password / email or userid

---

#### POST `/auth/token` — Log in and get session

Authenticates a user and returns a Supabase session. The user **must** be a member of at least one sector in this event, otherwise `403`.

**Body**

| Field | Type | Required |
| --- | --- | --- |
| `password` | string | yes |
| `email` | string | one of `email`/`userid` |
| `userid` | string | one of `email`/`userid` |

**Response (`200`)**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1234567890,
  "user": { "id": "...", "email": "...", "full_name": "..." }
}
```

- `401` — Invalid credentials
- `403` — User not assigned to any sector in this event

---

#### GET `/users/check/:userid` — Check userid availability

Returns whether a synthetic userid is available for registration.

**Response (`200`)**

```json
{ "userid": "abc123", "available": true }
```

---

### 4.2 Sectors

#### POST `/sectors` — Create a sector

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `sector_name` | string | yes | Display name |
| `region` | string | no | Defaults to `""` |
| `custom_id` | string | no | Caller-defined stable id; must be unique within the event |
| `other_details` | object | no | Arbitrary JSON, defaults to `{}` |

**Responses**

- `201` — The created sector row
- `409` — Sector with this `custom_id` already exists
- `400` — Missing `sector_name`

---

#### POST `/sectors/:custom_id/members` — Assign user to sector

Adds a user as a member of the sector identified by `custom_id` (URL-encoded).

**Body** — at least one of:

| Field | Type | Notes |
| --- | --- | --- |
| `user_id` | string | Supabase user id (preferred) |
| `email` | string | Looked up against auth users |
| `userid` | string | Synthesized into the synthetic email and looked up |

**Responses**

- `201` — `{ sector_id, user_id, custom_id, assigned_at }`
- `404` — Sector not found / User not found
- `409` — User already assigned to this sector

---

#### GET `/sectors/:custom_id/users` — List sector members

**Response (`200`)**

```json
{
  "sector_custom_id": "north-01",
  "sector_name": "Northern Region",
  "users": [
    { "id": "...", "email": "...", "full_name": "...", "pilot_handle": "...", "assigned_at": "..." }
  ]
}
```

- `404` — Sector not found

---

#### GET `/sectors/:custom_id/results` — Best attempts per member

Returns the **best completed attempt** per (user, challenge) for members of this sector.

**Query params**

| Param | Type | Notes |
| --- | --- | --- |
| `challenge_id` | uuid | Optional filter to a single challenge |

**Response (`200`)**

```json
{
  "sector_custom_id": "north-01",
  "sector_name": "Northern Region",
  "results": [
    {
      "user_id": "...", "full_name": "...", "email": "...", "pilot_handle": "...",
      "challenge_id": "...", "challenge_name": "...",
      "best_score": 95, "max_score": 100, "elapsed_seconds": 42.5,
      "completed_at": "2026-07-20T..."
    }
  ]
}
```

Results are sorted by `best_score` descending. Only `outcome = 'completed'` attempts are considered; ties break by lower `elapsed_sec`.

- `404` — Sector not found

---

#### GET `/sectors/check/:custom_id` — Check custom_id availability

**Response (`200`)**

```json
{ "custom_id": "north-01", "available": true }
```

---

### 4.3 Challenges

#### GET `/challenges` — List event challenges

**Query params**

| Param | Type | Notes |
| --- | --- | --- |
| `status` | string | Optional filter (e.g. `published`) |

**Response (`200`)**

```json
{
  "event_id": "...",
  "challenges": [
    { "id": "...", "name": "...", "description": "...", "challenge_mode": "...", "status": "...", "order_index": 0, "created_at": "..." }
  ]
}
```

Ordered by `order_index` ascending.

---

#### GET `/challenges/:challenge_id/results` — Leaderboard for one challenge

Calls the `get_event_results` RPC scoped to this event and challenge.

**Query params**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | int | `500` | Capped at `1000` |
| `offset` | int | `0` | Pagination offset |

**Response (`200`)**

```json
{
  "challenge_id": "...",
  "challenge_name": "...",
  "challenge_mode": "...",
  "total": 42,
  "limit": 500,
  "offset": 0,
  "results": [ /* get_event_results rows */ ]
}
```

- `404` — Challenge not found (or not part of this event)

---

### 4.4 Results (event-wide)

#### GET `/results` — Full event leaderboard

**Query params**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `challenge_id` | uuid | none | Optional filter |
| `limit` | int | `500` | Capped at `1000` |
| `offset` | int | `0` | Pagination offset |

**Response (`200`)**

```json
{
  "event_id": "...",
  "total": 120,
  "limit": 500,
  "offset": 0,
  "results": [ /* get_event_results rows */ ]
}
```

---

## 5. Rate limiting & safety

- The function does not currently implement rate limiting. Callers should self-throttle and avoid hammering `/auth/token`.
- API keys grant **write access** to users and sectors for their event. Treat raw keys as secrets; rotate via the `event_api_keys` table (`is_active`, `expires_at`).
- All mutating operations are idempotent-ish: duplicate user creation returns `409`, duplicate sector membership returns `409`.

---

## 6. Quick start (curl)

```bash
BASE="https://<project>.supabase.co/functions/v1/external-api"
KEY="ek_live_..."

# Register a participant by userid
curl -s -X POST "$BASE/users" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"pilot-42","password":"s3cret","full_name":"Asha"}'

# Log in
curl -s -X POST "$BASE/auth/token" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"pilot-42","password":"s3cret"}'

# Create a sector
curl -s -X POST "$BASE/sectors" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"sector_name":"Northern","custom_id":"north-01","region":"Region A"}'

# Assign the pilot to the sector
curl -s -X POST "$BASE/sectors/north-01/members" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"pilot-42"}'

# Pull sector results
curl -s "$BASE/sectors/north-01/results" -H "X-API-Key: $KEY"

# Pull event-wide results
curl -s "$BASE/results?limit=100" -H "X-API-Key: $KEY"
```

---

## 7. Extending the API

When adding a new endpoint to `supabase/functions/external-api/index.ts`:

1. Match the path and method early, inside the `try` block, after the `eventId` is resolved.
2. Use `supabaseAdmin` (service role) for privileged reads/writes; use a public client only when you need RLS-enforced behavior (e.g. sign-in).
3. Always scope queries by `eventId` — never expose data across events.
4. Return errors via `errorResponse(message, status)` and successes via `okResponse(data, status)`.
5. Validate input explicitly; return `400` with a clear message on missing fields.
6. Do not log raw API keys or passwords.
7. Re-deploy with the `deploy_edge_function` tool — do not edit the function in the dashboard.

---

## 8. Competition Mode

Competition Mode is an opt-in track for events that need lightweight,
token-based competitor registration and session minting — without requiring
external integrators to manage passwords or sector memberships manually.

### 8.1 Enabling Competition Mode

An organizer enables Competition Mode at event creation time via the
Organizer Dashboard "New event" form (a "Competition mode" toggle). The
flag is stored on `events.competition_mode` (boolean, default `false`).
Only events with `competition_mode = true` appear in the public
competition listing endpoint and accept competition registrations.

### 8.2 Competition Endpoints

Once an event is in Competition Mode, the organizer's Event Detail page
shows a **Competition Endpoints** card. Each endpoint is a named,
passcode-protected entry point that hosts a single assigned challenge:

- **Name** — human-readable label (e.g. "North Booth A"), unique within the event.
- **Passcode** — generated client-side, stored as a SHA-256 hash
  (`competition_endpoints.passcode_hash`); the raw passcode is shown
  **once** at creation and never again (only a 4-char prefix is stored
  for display).
- **Assigned challenge** — the challenge this endpoint hosts (nullable,
  so an endpoint can be created before a challenge is chosen).
- **Active flag** — soft-disable an endpoint without deleting it.

Endpoints are stored in the `competition_endpoints` table and managed
entirely through the Organizer Dashboard (no REST endpoints for CRUD;
organizers use the dashboard UI).

### 8.3 Competition REST API

The competition endpoints are **public** — they do **not** require an
`X-API-Key` header. They are scoped by `event_id` in the request body
(or path) and rely on the `competition_mode` flag for authorization.

#### GET `/competition/events` — List competition-mode events

Returns all events where `competition_mode = true`, newest first.

**Response (`200`)**

```json
{
  "events": [
    {
      "id": "...",
      "name": "Regional Finals 2026",
      "description": "...",
      "status": "published",
      "start_date": "2026-09-01",
      "end_date": "2026-09-03",
      "location": "Kuala Lumpur",
      "organizer_name": "DroneCode MY",
      "created_at": "2026-07-20T..."
    }
  ]
}
```

---

#### POST `/competition/register` — Register a competitor

Registers a competitor into a competition-mode event. A synthetic auth
user is created behind the scenes and a unique 5-character alphanumeric
token is returned. This token is the competitor's credential for the
event — they use it to mint a competition session.

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `event_id` | uuid | yes | Must be a competition-mode event |
| `sector` | string | yes | Sector label (e.g. school/team name) |
| `region` | string | no | Region label, defaults to `""` |
| `name` | string | yes | Competitor display name |

**Response (`201`)**

```json
{
  "registration_id": "...",
  "token": "K7Q2M",
  "event_id": "...",
  "sector": "SMK Taman Tun",
  "region": "KL",
  "name": "Asha Rahman",
  "created_at": "2026-07-20T..."
}
```

**Errors**

| Code | Meaning |
| --- | --- |
| `400` | Missing `event_id`, `sector`, or `name`; or event is not in competition mode |
| `404` | `event_id` not found |
| `409` | Token collision (retry the request) |

The `token` is 5 characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
(ambiguous characters `0`, `O`, `1`, `I` excluded). It is unique across all
events. Store it securely — it is the only credential needed to sign in
to a competition session for this registration.

---

#### POST `/competition/session` — Redeem token for a session

Exchanges a competition token for a Supabase session (access + refresh
tokens). The session is scoped to the synthetic user created at
registration. Optionally pass `event_id` to disambiguate a token across
events (tokens are globally unique, so this is only a safety check).

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | yes | The 5-char token from `/competition/register` |
| `event_id` | uuid | no | Optional scope check |

**Response (`200`)**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1234567890,
  "registration": {
    "id": "...",
    "event_id": "...",
    "sector": "SMK Taman Tun",
    "region": "KL",
    "name": "Asha Rahman"
  },
  "user": { "id": "...", "email": "comp_k7q2m@api.viblock.arena", "full_name": "Asha Rahman" }
}
```

**Errors**

| Code | Meaning |
| --- | --- |
| `400` | Missing `token` |
| `401` | Invalid token, or session credentials unavailable |
| `500` | Internal error |

The returned `access_token` can be used as the `Authorization: Bearer ...`
header against the Supabase REST/Realtime APIs and the Arena frontend to
participate in the event's challenges.

---

### 8.4 Quick start (curl)

```bash
BASE="https://<project>.supabase.co/functions/v1/external-api"

# 1. List all competition-mode events
curl -s "$BASE/competition/events"

# 2. Register a competitor (no API key needed)
curl -s -X POST "$BASE/competition/register" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"<event-uuid>","sector":"SMK Taman Tun","region":"KL","name":"Asha Rahman"}'
# -> { "token": "K7Q2M", ... }

# 3. Redeem the token for a competition session
curl -s -X POST "$BASE/competition/session" \
  -H "Content-Type: application/json" \
  -d '{"token":"K7Q2M"}'
# -> { "access_token": "...", "refresh_token": "...", ... }
```

---

### 8.5 Security notes

- Competition registration endpoints are public by design — they are the
  public-facing sign-up for a competition. Do not expose them to
  untrusted networks without rate limiting.
- The raw passcode for a Competition Endpoint is shown once at creation
  in the Organizer Dashboard. The stored `passcode_hash` is SHA-256 and
  cannot be reversed.
- The synthetic user's random password is stored in
  `auth.users.raw_user_meta_data.competition_password` so the
  `/competition/session` endpoint can sign in without the competitor
  ever seeing it. This is acceptable for the competition flow because
  the token itself is the credential.
- Tokens are 5 characters from a 32-character alphabet (~33 million
  possibilities). For high-stakes events, consider adding rate limiting
  on `/competition/session` to prevent brute-force attempts.
