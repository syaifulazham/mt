# Prompt for the Eptim FC-1 (Viblock Arena) developer — challenge registration API

> Paste everything below this line to the FC-1 developer (or their coding agent).

---

You are working on the Viblock Arena backend — the Supabase Edge Function at
`supabase/functions/external-api/index.ts`, documented in
`VIBLOCK-ARENA-API-GUIDELINE.md`. Add a **challenge registration** resource to the
keyed external API so that an integrating system (Malaysia Techlympics) can
register an existing player for a specific challenge of the event, and read
those registrations back.

## Why this is needed

Techlympics runs FC-1 as an individual competition. A participant first gets an
FC-1 player account — this already works with the current API:

1. `GET /sectors/check/:custom_id` → `POST /sectors` (one sector per school/contingent)
2. `GET /users/check/:userid` → `POST /users` (`userid` = the participant's IC digits)
3. `POST /sectors/:custom_id/members`

The organizer then picks which of the event's challenges (`GET /challenges`) a
Techlympics competition uses, and each participant registers for the specific
challenge(s) they will compete in.

**That last step has no API today.** There is no challenge-level participant
resource: challenges can be listed and their results read, but nothing records
that player X has entered challenge Y. Competition Mode endpoints are
dashboard-managed kiosks, not a REST registration. Techlympics is currently
recording registrations on its own side and will push them to FC-1 as soon as
these endpoints exist.

## Conventions — follow the existing guide (§7 "Extending the API")

- Authenticate with `X-API-Key`; resolve `eventId` from the key **before**
  matching these routes, and scope every query by it. A challenge that is not in
  the key's event must behave exactly like a missing one (`404`).
- Use `supabaseAdmin` for reads and writes; return via `okResponse(data, status)`
  / `errorResponse(message, status)` with the `{ "error": "<message>" }` shape.
- Validate input explicitly; `400` with a clear message on missing fields.
- Accept the player as **exactly one of** `user_id` (preferred), `userid`
  (synthesised to `<userid>@api.viblock.arena`, as in §3) or `email` — the same
  resolution `POST /sectors/:custom_id/members` already does. Reuse that code.
- Do not log raw API keys or passwords. Deploy with `deploy_edge_function`.
- `DELETE` is already in the CORS `Access-Control-Allow-Methods` list; make sure
  the router actually accepts it.

## 1. Data model

```sql
create table public.challenge_registrations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id)     on delete cascade,
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null references auth.users(id)        on delete cascade,
  external_ref  text,                         -- caller's own id, for reconciliation
  created_at    timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index challenge_registrations_event_idx on public.challenge_registrations (event_id);
create index challenge_registrations_user_idx  on public.challenge_registrations (user_id);

alter table public.challenge_registrations enable row level security;
-- Writes only through the Edge Function (service role). Players may read their own.
create policy "players read own registrations"
  on public.challenge_registrations for select
  using (auth.uid() = user_id);
```

`event_id` is stored redundantly on purpose: it makes event scoping a single
indexed predicate and guards against a challenge being moved between events.

## 2. Endpoints (required)

### POST `/challenges/:challenge_id/registrations` — register a player

**Body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | uuid | one of the three | Supabase user id |
| `userid` | string | one of the three | Synthetic userid |
| `email` | string | one of the three | Real email |
| `external_ref` | string | no | Stored verbatim (Techlympics sends its registration id) |

**Rules**

- `404` if the challenge is not in this event, or the player does not exist.
- `403` if the player is not a member of any sector in this event — the same
  rule `POST /auth/token` already enforces, so a registered player can always
  sign in.
- `409` if already registered; the body should still include the existing
  registration so callers can treat it as success:
  `{ "error": "Already registered", "registration": { …same shape as 201… } }`.

**Response `201`**

```json
{
  "registration_id": "…",
  "challenge_id": "…",
  "user_id": "…",
  "userid": "110101105513",
  "full_name": "Ali Bin Abu",
  "external_ref": "cmv1…",
  "registered_at": "2026-09-30T10:00:00.000Z"
}
```

`userid` is the synthetic id when the player was created by `userid` (strip
`@api.viblock.arena` from the email), otherwise `null`.

### GET `/challenges/:challenge_id/registrations` — list registrations

Query: `limit` (default 500, max 1000), `offset` (default 0).

```json
{
  "challenge_id": "…",
  "challenge_name": "Delivery Boybot",
  "total": 42,
  "limit": 500,
  "offset": 0,
  "registrations": [
    { "registration_id": "…", "user_id": "…", "userid": "…", "full_name": "…",
      "email": "…", "sector_custom_id": "…", "external_ref": "…", "registered_at": "…" }
  ]
}
```

Ordered by `registered_at` ascending. `sector_custom_id` is the player's sector
in this event (first one if several). `404` if the challenge is not in this event.

### GET `/users/:userid/registrations` — one player's registrations

`:userid` is the synthetic userid (URL-encoded). Returns only registrations in
this event.

```json
{
  "userid": "110101105513",
  "user_id": "…",
  "registrations": [
    { "registration_id": "…", "challenge_id": "…", "challenge_name": "…",
      "external_ref": "…", "registered_at": "…" }
  ]
}
```

`404` if the player does not exist. A player with no registrations returns `200`
with an empty array.

### DELETE `/challenges/:challenge_id/registrations/:userid` — withdraw

`204` on success; `404` if the challenge, player or registration does not exist
in this event. Attempts and results already recorded are **not** deleted.

## 3. Recommended (not blocking)

These close gaps Techlympics will hit right after registration ships. Implement
them if time allows; say so if you don't.

1. **Enforce registration.** Add `challenges.registration_required boolean not
   null default false`. When `true`, a player without a row in
   `challenge_registrations` cannot start an attempt on that challenge — enforce
   it where attempts are created, not only in the UI. Return the flag in
   `GET /challenges` items. Without this, registration is advisory: any player in
   the event can still play any challenge.
2. **Challenge launch link.** `POST /challenges/:challenge_id/launch` with
   `{ user_id | userid | email }` returns
   `{ "login_url": "…", "expires_at": "…" }` — a **single-use**, short-lived
   (≈120 s) URL that signs the player in and lands them directly on that
   challenge. `403` if `registration_required` is set and the player is not
   registered. This lets Techlympics send participants into FC-1 without holding
   their passwords or putting Supabase access tokens in URLs.
3. **Player lookup.** `GET /users/:userid` →
   `{ user_id, userid, full_name, email, sectors: [{ custom_id, sector_name }] }`
   (`404` if absent). Today only `/users/check/:userid` exists, which answers
   "available?" but not "who, and in which sector?".

## 4. Acceptance criteria

- [ ] Migration creates `challenge_registrations` with the unique constraint and RLS above.
- [ ] All four required endpoints exist, are `X-API-Key`-scoped, and never return
      data from another event (a challenge id from event B under event A's key → `404`).
- [ ] Registering twice returns `409` with the existing registration in the body.
- [ ] Registering a player who is in no sector of the event returns `403`.
- [ ] `DELETE` withdraws without touching attempts/results.
- [ ] `VIBLOCK-ARENA-API-GUIDELINE.md` gains a §4.5 "Challenge registrations"
      section documenting the above (and §3 items if implemented).
- [ ] The curl script below passes against a test event.

## 5. Test script

```bash
BASE="https://<project>.supabase.co/functions/v1/external-api"
KEY="ek_test_..."
CH="<challenge-uuid-in-this-event>"

# setup: player + sector (existing endpoints)
curl -s -X POST "$BASE/sectors" -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"sector_name":"SMK Test","custom_id":"test-sector-01"}'
curl -s -X POST "$BASE/users" -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"userid":"test-player-01","password":"Passw0rd!","full_name":"Test Player"}'

# 403 — not yet in a sector
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/challenges/$CH/registrations" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" -d '{"userid":"test-player-01"}'

curl -s -X POST "$BASE/sectors/test-sector-01/members" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"userid":"test-player-01"}'

# 201, then 409 with the same registration
curl -s -X POST "$BASE/challenges/$CH/registrations" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"userid":"test-player-01","external_ref":"mt-123"}'
curl -s -X POST "$BASE/challenges/$CH/registrations" -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{"userid":"test-player-01"}'

# reads
curl -s "$BASE/challenges/$CH/registrations" -H "X-API-Key: $KEY"
curl -s "$BASE/users/test-player-01/registrations" -H "X-API-Key: $KEY"

# 404 — unknown challenge id
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/challenges/00000000-0000-0000-0000-000000000000/registrations" -H "X-API-Key: $KEY"

# withdraw → 204, then 404
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/challenges/$CH/registrations/test-player-01" -H "X-API-Key: $KEY"
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/challenges/$CH/registrations/test-player-01" -H "X-API-Key: $KEY"
```
