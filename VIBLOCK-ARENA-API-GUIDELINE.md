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

#### POST `/auth/launch` — One-click launch into the Arena website

Creates a **single-use** launch code. The code expires **5 minutes** after it's created. Send the player to the Arena website with this code and they arrive signed in, without being asked for a password. Typically your server calls this when the player clicks "Open Viblock Arena" in your app, then redirects their browser.

Rules:

- The player must have role `player`. You can't create launch codes for organizer, team manager, or admin accounts (`403`).
- The player must be assigned to a sector in this API key's event (`403`).
- Only call this from your **server**. The `X-API-Key` must never reach a browser.

**Body** (exactly one identifier)

| Field | Type | Notes |
| --- | --- | --- |
| `userid` | string | Synthetic userid |
| `email` | string | Real email |
| `user_id` | uuid | Internal user id |

**Response (`201`)**

```json
{
  "user_id": "...",
  "launch_code": "Xk3...q9A",
  "launch_path": "/?launch=Xk3...q9A",
  "expires_at": "2026-10-04T10:05:00.000Z"
}
```

Open `https://<arena-web-address>` + `launch_path` in the player's browser. The website exchanges the code for a session and then removes it from the address bar. If the code was already used or has expired, the website shows a "Couldn't sign you in" message. Create a fresh code each time the player launches.

- `400` — No identifier supplied
- `403` — Not a player, or not assigned to a sector in this event
- `404` — Player not found

> The Arena website exchanges the code itself through `POST /auth/launch/redeem` (no API key needed). Partner apps don't need to call it.

#### GET `/auth/launch/:launch_code` — Check a launch code

Returns the status of a launch code issued with **this** API key's event. Codes from other events return `404`. Use this to decide whether to reuse a code or create a fresh one.

**Response (`200`)**

```json
{
  "user_id": "...",
  "status": "valid",
  "created_at": "2026-10-04T10:00:00.000Z",
  "expires_at": "2026-10-04T10:05:00.000Z",
  "used_at": null,
  "seconds_remaining": 212
}
```

| `status` | Meaning |
| --- | --- |
| `valid` | Not used yet and not expired. Can still be opened. |
| `used` | Already redeemed. The player signed in with it. |
| `expired` | Not used within 5 minutes. Create a new one. |

- `404` — Code not found for this event

**Example**

```bash
curl -s -X POST "$BASE/auth/launch" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"pilot-42"}'
# then redirect the player to https://<arena-web-address>/?launch=<launch_code>
```

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

### 4.5 Challenge registrations

Register an existing player for a specific challenge of the event. Writes happen only through this API (service role); authenticated players can read their own registrations directly via Supabase. Registrations are **unique per (challenge, player)** and are scoped to the API key's event — a challenge id from another event behaves exactly like an unknown id (`404`).

Before a player can be registered they must already exist (`POST /users`) and belong to a sector in this event (`POST /sectors/:custom_id/members`). The player is identified in request bodies by exactly one of `user_id`, `userid` (synthetic → `<userid>@api.viblock.arena`) or `email`, matching `POST /sectors/:custom_id/members`.

#### POST `/challenges/:challenge_id/registrations` — register a player

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | uuid | one of the three | Supabase user id |
| `userid` | string | one of the three | Synthetic userid |
| `email` | string | one of the three | Real email |
| `external_ref` | string | no | Stored verbatim (e.g. Techlympics registration id) |

**Rules**

- `404` if the challenge is not in this event, or the player does not exist.
- `403` if the player is not in any sector of this event.
- `409` if already registered; the body includes the existing registration so callers can treat it as success:

```json
{ "error": "Already registered", "registration": { /* same shape as 201 */ } }
```

**Response (`201`)**

```json
{
  "registration_id": "...",
  "challenge_id": "...",
  "user_id": "...",
  "userid": "110101105513",
  "full_name": "Ali Bin Abu",
  "external_ref": "mt-123",
  "registered_at": "2026-09-30T10:00:00.000Z"
}
```

`userid` is `null` if the player was created with a real email instead of a synthetic userid.

#### GET `/challenges/:challenge_id/registrations` — list registrations

**Query params**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | int | `500` | Capped at `1000` |
| `offset` | int | `0` | Pagination offset |

Ordered by `registered_at` ascending. `404` if the challenge is not in this event.

**Response (`200`)**

```json
{
  "challenge_id": "...",
  "challenge_name": "Delivery Boybot",
  "total": 42,
  "limit": 500,
  "offset": 0,
  "registrations": [
    {
      "registration_id": "...",
      "user_id": "...",
      "userid": "110101105513",
      "full_name": "Ali Bin Abu",
      "email": "110101105513@api.viblock.arena",
      "sector_custom_id": "smk-test-01",
      "external_ref": "mt-123",
      "registered_at": "2026-09-30T10:00:00.000Z"
    }
  ]
}
```

`sector_custom_id` is the player's first sector in this event (or `null` if they have none at list time).

#### GET `/users/:userid/registrations` — one player's registrations

`:userid` is the synthetic userid (URL-encoded). Only returns registrations in this event. `404` if the player does not exist. A player with no registrations returns `200` with an empty array.

**Response (`200`)**

```json
{
  "userid": "110101105513",
  "user_id": "...",
  "registrations": [
    {
      "registration_id": "...",
      "challenge_id": "...",
      "challenge_name": "Delivery Boybot",
      "external_ref": "mt-123",
      "registered_at": "2026-09-30T10:00:00.000Z"
    }
  ]
}
```

#### GET `/challenges/:challenge_id/registrations/:userid` — check one registration

`:userid` is the synthetic userid (URL-encoded). Returns `200` whether or not the player is registered; check the `registered` flag. `404` only if the challenge is not in this event or the player does not exist.

**Response (`200`) — registered**

```json
{
  "challenge_id": "...",
  "challenge_name": "Delivery Boybot",
  "userid": "110101105513",
  "user_id": "...",
  "registered": true,
  "registration": {
    "registration_id": "...",
    "external_ref": "mt-123",
    "registered_at": "2026-09-30T10:00:00.000Z"
  }
}
```

**Response (`200`) — not registered**

```json
{
  "challenge_id": "...",
  "challenge_name": "Delivery Boybot",
  "userid": "110101105513",
  "user_id": "...",
  "registered": false,
  "registration": null
}
```

#### GET `/challenges/:challenge_id/attempts/:userid` — Has the player taken the challenge?

`:userid` is the synthetic userid (URL-encoded). Summarises every run the player has made on this challenge, whatever the outcome (`completed`, `failed`, `aborted`, `surrender`, `time-ended`).

**Response (`200`)**

```json
{
  "challenge_id": "...",
  "challenge_name": "Delivery Boybot",
  "userid": "110101105513",
  "user_id": "...",
  "attempted": true,
  "completed": true,
  "attempt_count": 3,
  "completed_count": 1,
  "max_attempts": 5,
  "attempts_remaining": 2,
  "best_attempt": { "score": 80, "max_score": 100, "elapsed_seconds": 41.2, "completed_at": "..." },
  "last_attempt": { "outcome": "failed", "score": 20, "max_score": 100, "elapsed_seconds": 60, "attempted_at": "..." }
}
```

- `attempted` — `true` if the player has started at least one run
- `completed` — `true` if at least one run finished successfully
- `max_attempts` / `attempts_remaining` — `null` when the challenge has no attempt limit
- `best_attempt` — best completed run (highest score, then fastest), or `null`
- `last_attempt` — most recent run of any outcome, or `null`
- `404` — Challenge (in this event) or player not found

#### DELETE `/challenges/:challenge_id/registrations/:userid` — withdraw

`:userid` is the synthetic userid (URL-encoded). `204` on success; `404` if the challenge, player, or registration does not exist in this event. Attempts and results already recorded are **not** deleted.

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

#### GET `/competition/tokens/:token` — Read assigned token info

Returns the registration details for a given competition token. Public
endpoint (no `X-API-Key` required). Useful for an organizer kiosk to look
up which player a token belongs to and whether it has already been
redeemed.

**Path**

| Part | Description |
| --- | --- |
| `:token` | The 5-char competition token (URL-encoded if needed) |

**Response (`200`)**

```json
{
  "token": "K7Q2M",
  "registration_id": "...",
  "event_id": "...",
  "event_name": "Regional Finals 2026",
  "event_status": "published",
  "sector": "SMK Taman Tun",
  "region": "KL",
  "name": "Asha Rahman",
  "user_id": "...",
  "created_at": "2026-07-20T...",
  "used_at": null,
  "is_used": false
}
```

**Errors**

| Code | Meaning |
| --- | --- |
| `404` | Token not found, or its event not found |
| `400` | The event is not in competition mode |

`used_at` is `null` when the token has never been redeemed; once set,
`is_used` is `true` and the token can no longer be used to mint a session
(see `/competition/session` single-use enforcement).

---

#### POST `/competition/tokens/:token/renew` — Renew a token

Issues a **new** 5-char token for the same registration/player, replacing
the old one. The old token is invalidated immediately and `used_at` is
cleared, so the new token can be redeemed for a fresh session. Use this
when a competitor loses their token, or after a token has been consumed
and the player needs another attempt.

**Path**

| Part | Description |
| --- | --- |
| `:token` | The 5-char competition token to renew (URL-encoded if needed) |

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `event_id` | uuid | no | Optional scope check (token is globally unique) |

**Response (`200`)**

```json
{
  "old_token": "K7Q2M",
  "token": "R9P3X",
  "registration_id": "...",
  "event_id": "...",
  "sector": "SMK Taman Tun",
  "region": "KL",
  "name": "Asha Rahman",
  "user_id": "...",
  "created_at": "2026-07-20T..."
}
```

**Errors**

| Code | Meaning |
| --- | --- |
| `404` | Token not found, or its event not found |
| `400` | The event is not in competition mode |
| `500` | Failed to generate a unique new token |

The new token uses the same alphabet and uniqueness rules as
`/competition/register`. The synthetic auth user's email is updated to
match the new token so `/competition/session` continues to work without
any client-side changes.

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

# 4. Read assigned token info (public, no API key)
curl -s "$BASE/competition/tokens/K7Q2M"
# -> { "token": "K7Q2M", "name": "Asha Rahman", "is_used": false, ... }

# 5. Renew a token (issue a new token for the same player)
curl -s -X POST "$BASE/competition/tokens/K7Q2M/renew" \
  -H "Content-Type: application/json" \
  -d '{}'
# -> { "old_token": "K7Q2M", "token": "R9P3X", ... }
```

---

### 8.5 Client session lifecycle (browser cookies)

The CompetitionGate UI persists the organizer passcode in a browser
cookie (`vb_comp_passcode`, 7-day expiry) together with the resolved
endpoint info (`vb_comp_endpoint`). This means:

- **Passcode is entered once.** On subsequent visits (or after a player's
  session ends), the gate restores the passcode from the cookie and skips
  straight to the token step. The competitor never re-enters the passcode.
- **Token is entered per player.** Each player still types their own
  5-char token to mint a session via `/competition/session`. When that
  player finishes, an **End session** button in the arena header signs
  out the supabase session and returns to the token screen — the
  passcode cookie is retained, so the next player only enters their token.
- **Full logout** clears both cookies and the supabase session,
  returning to the passcode screen. Use this when switching kiosks or
  events.

If a valid supabase session is still alive when the gate boots, it
resumes straight into the arena without prompting again.

---

### 8.6 Security notes

- Competition registration endpoints are public by design — they are the
  public-facing sign-up for a competition. Do not expose them to
  untrusted networks without rate limiting.
- The raw passcode for a Competition Endpoint is shown once at creation
  in the Organizer Dashboard. The stored `passcode_hash` is SHA-256 and
  cannot be reversed.
- The passcode cookie is stored in plaintext in the browser. For shared
  kiosks, use the **Full logout** button between events to clear it.
- The synthetic user's random password is stored in
  `auth.users.raw_user_meta_data.competition_password` so the
  `/competition/session` endpoint can sign in without the competitor
  ever seeing it. This is acceptable for the competition flow because
  the token itself is the credential.
- Tokens are 5 characters from a 32-character alphabet (~33 million
  possibilities). For high-stakes events, consider adding rate limiting
  on `/competition/session` to prevent brute-force attempts.
