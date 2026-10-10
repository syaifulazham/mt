# Request for the Eptim Drone developer — challenge registration, attempts and one-click launch

> Hand everything below this line to the Eptim Drone developer (or their coding agent).

---

You maintain the Eptim Drone backend: the Supabase Edge Function behind
`https://<drone-project>.supabase.co/functions/v1/eptim-api` and the Drone web
app at `https://drone.eptim.ai`. Malaysia Techlympics already integrates with it
through `X-API-Key` (sectors, users, `/auth/token`, `GET /challenges`).

Please add the endpoints below. **They already exist, with exactly this
contract, in the Eptim FC-1 (Viblock Arena) backend**, which shares this API's
design — same `/sectors`, `/users`, `/auth/token` and `/challenges` shapes. If
the two code bases have a common origin, porting the FC-1 implementation is the
fastest route. Techlympics will call them with the same code it uses for FC-1,
so please keep paths, fields, status codes and error shapes identical.

## Why

Techlympics is giving Eptim Drone the same participant flow that FC-1 has:

1. The organizer picks which of the Drone event's challenges a competition uses
   (`GET /challenges` — already works).
2. On the participant dashboard, each picked challenge shows a single action:
   **Daftar** (register) → **Mula cabaran** (one-click sign-in) →
   **Mohon pautan baharu** (fresh link once it expires or is used) →
   **Selesai** + best score once completed.

Step 2's registration, completion and sign-in need endpoints Drone doesn't have
yet. Probing the current API with a valid key:

```
GET  /challenges                                   → 200 (works)
POST /challenges/:id/registrations                 → 404 {"error":"Not found"}
GET  /challenges/:id/registrations[/:userid]       → 404 {"error":"Not found"}
GET  /users/:userid/registrations                  → 404 {"error":"Not found"}
GET  /challenges/:id/attempts/:userid              → 404 {"error":"Not found"}
POST /auth/launch                                  → 404 {"error":"Not found"}
GET  /auth/launch/:code                            → 404 {"error":"Not found"}
```

## Drone-specific notes

- **Players are teams.** Drone competitions at Techlympics are team
  competitions, so each Drone player is a *team account*: created with
  `POST /users` using `userid` = the Techlympics team id (lower-cased), and a
  member of the sector for the team's contingent. Every `:userid` below is that
  synthetic userid. Keep whatever synthetic-email scheme Drone already uses for
  `userid`-created players — just resolve `userid` the same way
  `POST /sectors/:custom_id/members` does today.
- **The web app must accept launch codes.** `POST /auth/launch` returns a
  `launch_path` of `/?launch=<code>`; Techlympics opens
  `https://drone.eptim.ai` + that path. The Drone web app needs to exchange the
  code for a session (FC-1 does this through `POST /auth/launch/redeem`, no API
  key) and then remove it from the address bar, showing a "couldn't sign you in"
  message for used or expired codes.
- `GET /challenges` items already include `max_attempts`; the attempts endpoint
  below reports against it.
- Follow the existing conventions: scope every query by the API key's event (a
  challenge id from another event behaves exactly like an unknown id — `404`),
  `{ "error": "<message>" }` error bodies, no raw keys or passwords in logs.

## Endpoints to add

The contract below is copied verbatim from the FC-1 guide
(`VIBLOCK-ARENA-API-GUIDELINE.md`). Read "Arena website" as the Drone web app.

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


## Acceptance criteria

- [ ] Every endpoint above exists on the Drone API with the same path, body,
      response fields and status codes, scoped to the API key's event.
- [ ] Registering twice returns `409` with the existing registration in the body.
- [ ] Registering, launching or reading attempts for a player in no sector of
      the event returns `403`.
- [ ] `https://drone.eptim.ai/?launch=<code>` signs the player in once; a second
      use or a code older than 5 minutes shows the "couldn't sign you in" page.
- [ ] `GET /auth/launch/:code` reports `valid` → `used` after sign-in, and
      `expired` after 5 minutes unused.
- [ ] The Drone API guide documents these endpoints.

## Test script

```bash
BASE="https://<drone-project>.supabase.co/functions/v1/eptim-api"
KEY="<drone api key>"
CH=$(curl -s "$BASE/challenges" -H "X-API-Key: $KEY" | jq -r '.challenges[0].id')

curl -s -X POST "$BASE/sectors" -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"sector_name":"MT Test","custom_id":"mt-test-sector"}'
curl -s -X POST "$BASE/users" -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"mt-test-team","password":"Passw0rd!","full_name":"MT Test Team"}'

# 403 before sector membership, then join the sector
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/challenges/$CH/registrations" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" -d '{"userid":"mt-test-team"}'
curl -s -X POST "$BASE/sectors/mt-test-sector/members" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"userid":"mt-test-team"}'

# 201, then 409 with the same registration
curl -s -X POST "$BASE/challenges/$CH/registrations" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"userid":"mt-test-team","external_ref":"mt-123"}'
curl -s -X POST "$BASE/challenges/$CH/registrations" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"userid":"mt-test-team"}'

# reads
curl -s "$BASE/challenges/$CH/registrations/mt-test-team" -H "X-API-Key: $KEY"
curl -s "$BASE/users/mt-test-team/registrations" -H "X-API-Key: $KEY"
curl -s "$BASE/challenges/$CH/attempts/mt-test-team" -H "X-API-Key: $KEY"

# launch: create, check (valid), open https://drone.eptim.ai/?launch=<code>, check (used)
CODE=$(curl -s -X POST "$BASE/auth/launch" -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"mt-test-team"}' | jq -r .launch_code)
curl -s "$BASE/auth/launch/$CODE" -H "X-API-Key: $KEY"

# withdraw → 204
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/challenges/$CH/registrations/mt-test-team" -H "X-API-Key: $KEY"
```
