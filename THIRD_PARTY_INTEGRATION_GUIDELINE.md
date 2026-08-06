# Third-Party Integration Guideline
## Malaysia Techlympics Platform

**Document Version:** 1.0  
**Platform:** Malaysia Techlympics (`techlympics.my`)  
**Audience:** Third-party competition platform developers integrating with Techlympics

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Concepts](#2-core-concepts)
3. [Integration Patterns](#3-integration-patterns)
4. [Pattern A — Account-Based SSO Integration](#4-pattern-a--account-based-sso-integration)
5. [Pattern B — Token-Based Walk-in Integration](#5-pattern-b--token-based-walk-in-integration)
6. [Authentication](#6-authentication)
7. [Required API Endpoints](#7-required-api-endpoints)
8. [Data Formats](#8-data-formats)
9. [Error Handling](#9-error-handling)
10. [Configuration & Onboarding](#10-configuration--onboarding)
11. [Lifecycle Diagrams](#11-lifecycle-diagrams)
12. [Testing Checklist](#12-testing-checklist)
13. [Contact](#13-contact)

---

## 1. Overview

Malaysia Techlympics is a competition management platform that handles participant registration, team formation, contingent management, and event logistics. Third-party competition applications (e.g. drone simulators, coding arenas, game platforms) can be integrated so that participants and teams registered on Techlympics are automatically provisioned on the third-party platform with single sign-on (SSO).

### How It Works

Techlympics acts as the **identity and registration authority**. Your application acts as the **competition engine**. Techlympics calls your REST API to create accounts and issue tokens; your application uses those tokens to authenticate participants.

```
Techlympics                           Your Application
     │                                      │
     │  ── creates accounts via REST ──►    │
     │  ◄── issues JWT / token ──────────   │
     │                                      │
Participant opens your app URL
with the token appended → authenticated
```

Techlympics never exposes your API key to participants. All provisioning calls are server-to-server.

---

## 2. Core Concepts

Understanding these Techlympics entities is essential for correctly mapping data on your side.

| Techlympics Entity | Description | Maps To (typically) |
|---|---|---|
| **Participant** | An individual competitor. Has a name, IC number (national ID), gender, education level. | A User account on your platform |
| **Team** | A group of Participants competing together in one Competition. Has a name and belongs to a Contingent. | A User account or Team account on your platform |
| **Contingent** | The organisational unit a Participant or Team belongs to — typically a school, higher institution, or independent group. Has a name and state. | A Sector / Group / Organisation on your platform |
| **Competition** | A specific competition category within an Event (e.g. "Drone Racing — Secondary School"). Each Competition can be linked to exactly one third-party integration. | A Challenge / Room / Event on your platform |
| **Event** | The top-level Techlympics event (e.g. "Zon Tengah 2025"). Multiple Competitions are held under one Event. | — |
| **Walk-in Competition** | A competition where participants register on-site rather than pre-registering. Issues a short token for access. | A Drop-in / Open competition slot |

### Identifier Conventions

| Techlympics Field | Format | Example | Stable? |
|---|---|---|---|
| `contingent.id` | CUID | `clxyz123…` | Yes (permanent) |
| `team.id` | CUID | `clxyz456…` | Yes (permanent) |
| `participant.id` | CUID | `clxyz789…` | Yes (permanent) |
| `participant.ic` | String (digits only, no hyphens) | `020304050607` | Yes |
| `competition.id` | CUID | `clxyz000…` | Yes (permanent) |

All IDs are [CUIDs](https://github.com/paralleldrive/cuid2) — collision-resistant, URL-safe, 24-character strings.

---

## 3. Integration Patterns

There are two integration patterns. Choose the one that fits your platform's model.

### Pattern A — Account-Based SSO (for pre-registered competitions)

Best for: platforms where participants compete as individuals or teams using persistent accounts, and where competition progress/history is stored against those accounts.

**Examples of this pattern:** drone.eptim.ai

**How it works:**
1. Techlympics creates accounts on your platform for each participant/team (server-to-server).
2. When a participant wants to enter your platform, Techlympics exchanges credentials for a short-lived JWT.
3. The participant is redirected to your platform URL with the JWT appended — they land logged in.

**You must implement:** Sector management endpoints, user management endpoints, and token endpoint.

---

### Pattern B — Token-Based Walk-in (for on-site competitions)

Best for: platforms where participants compete on-site using a simple short token, without persistent accounts.

**Examples of this pattern:** Viblock Arena

**How it works:**
1. Techlympics registers a participant to your platform at counter check-in.
2. Your platform returns a short token (5–8 characters).
3. The participant enters this token directly into your platform's kiosk/interface.
4. No redirect or SSO — the token IS the credential.

**You must implement:** Competition event listing, competitor registration, and token lookup endpoints.

---

## 4. Pattern A — Account-Based SSO Integration

### Concept Mapping

| Your platform | Techlympics source | Value used as identifier |
|---|---|---|
| **Sector** (group/org) | `Contingent` | `contingent.id` as `custom_id` |
| **User** (individual) | `Participant` | `participant.ic` (digits only) as `userid` |
| **User** (team) | `Team` | `team.id` as `userid` |

### Required Endpoints

All endpoints are under your `BASE_URL`. Authentication via `X-API-Key` header (see §6).

---

#### 4.1 Check Sector

```
GET /sectors/check/{customId}
```

Checks whether a sector (organisation/group) with the given `customId` already exists.

**Path parameter:** `customId` — the `contingent.id` from Techlympics.

**Response `200 OK`:**
```json
{
  "custom_id": "clxyz123abc",
  "available": false
}
```

- `available: true` — sector does NOT exist yet (the name is available/free).
- `available: false` — sector already exists.

---

#### 4.2 Create Sector

```
POST /sectors
```

Creates a new sector for a Contingent.

**Request body:**
```json
{
  "sector_name": "SMK Taman Melawati",
  "custom_id": "clxyz123abc",
  "region": "Selangor",
  "other_details": {
    "shortName": "SMKTM",
    "contingentType": "SCHOOL"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `sector_name` | string | Yes | Human-readable name of the contingent |
| `custom_id` | string | Yes | The Techlympics `contingent.id` — use this as your permanent external reference |
| `region` | string | No | State or region name |
| `other_details` | object | No | Additional metadata; structure is flexible |
| `other_details.shortName` | string | No | Contingent short name or abbreviation |
| `other_details.contingentType` | string | No | `"SCHOOL"`, `"HIGHER_INSTITUTION"`, or `"INDEPENDENT"` |

**Response `201 Created`:**
```json
{
  "id": "your-internal-id",
  "sector_name": "SMK Taman Melawati",
  "custom_id": "clxyz123abc"
}
```

**Response `409 Conflict`:** Sector with this `custom_id` already exists. Techlympics treats 409 as a non-fatal success (idempotent).

---

#### 4.3 Check User

```
GET /users/check/{userid}
```

Checks whether a user with the given `userid` already exists.

**Path parameter:** `userid` — either the participant's IC digits or the team's CUID.

**Response `200 OK`:**
```json
{
  "userid": "020304050607",
  "available": false
}
```

- `available: true` — user does NOT exist yet.
- `available: false` — user already exists.

---

#### 4.4 Create User

```
POST /users
```

Creates a new user account.

**Request body:**
```json
{
  "userid": "020304050607",
  "password": "aB3dEf7gHi2j",
  "full_name": "Ahmad bin Yusof"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `userid` | string | Yes | Unique user identifier. For participants: IC digits. For teams: `team.id` |
| `password` | string | Yes | 12-character random alphanumeric string generated by Techlympics. Stored by Techlympics for future SSO use. |
| `full_name` | string | Yes | Participant's full name, or team name |

**Response `201 Created`:**
```json
{
  "id": "your-internal-user-id",
  "userid": "020304050607",
  "full_name": "Ahmad bin Yusof"
}
```

**Response `409 Conflict`:** User already exists. Treated as non-fatal by Techlympics.

---

#### 4.5 Assign Member to Sector

```
POST /sectors/{sectorCustomId}/members
```

Links a user (participant or team) to a sector (contingent).

**Path parameter:** `sectorCustomId` — the Techlympics `contingent.id`.

**Request body:**
```json
{
  "userid": "020304050607"
}
```

**Response `200 OK` or `201 Created`:**
```json
{
  "sector_id": "your-internal-sector-id",
  "user_id": "your-internal-user-id"
}
```

**Response `409 Conflict`:** Already a member. Treated as non-fatal.

---

#### 4.6 Issue Token (SSO Login)

```
POST /auth/token
```

Authenticates a user and returns a short-lived JWT access token. Called when a participant wants to enter your platform.

**Request body:**
```json
{
  "userid": "020304050607",
  "password": "aB3dEf7gHi2j"
}
```

**Response `200 OK`:**
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "expires_at": "2025-09-01T10:30:00Z",
  "user": {
    "id": "your-internal-user-id",
    "userid": "020304050607",
    "full_name": "Ahmad bin Yusof"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `access_token` | string | JWT; Techlympics appends this to your app URL as `?access_token=<token>` |
| `refresh_token` | string | Optional; currently unused by Techlympics |
| `expires_at` | ISO 8601 datetime | Expiry of `access_token` |
| `user` | object | Basic user info (logged for diagnostics) |

**SSO flow after token issuance:**  
Techlympics redirects the participant's browser to `{YOUR_APP_URL}?access_token=<access_token>`. Your frontend must read the `access_token` query parameter on load and use it to establish the authenticated session.

**Response `401 Unauthorized`:** Invalid credentials.

---

## 5. Pattern B — Token-Based Walk-in Integration

### Required Endpoints

All endpoints are under your `BASE_URL`. Some are authenticated (admin, `X-API-Key` header); some are public (no key required).

---

#### 5.1 Health Check *(Authenticated)*

```
GET /health
```

Returns `200 OK` if your service is operational. Used by Techlympics to verify configuration before enabling the integration toggle for an event.

**Response `200 OK`:**
```json
{ "status": "ok" }
```

---

#### 5.2 List Challenges *(Authenticated)*

```
GET /challenges
GET /challenges?status=active
```

Returns all available competition challenges/modes on your platform. Techlympics organizers choose one challenge to associate with each walk-in competition.

**Query parameter:** `status` (optional) — filter by status (e.g. `"active"`, `"draft"`).

**Response `200 OK`:**
```json
{
  "challenges": [
    {
      "id": "ch_abc123",
      "name": "City Builder Challenge",
      "description": "Build the tallest structure in 3 minutes",
      "challenge_mode": "timed",
      "status": "active",
      "order_index": 1,
      "created_at": "2025-01-15T08:00:00Z"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Your internal challenge ID — Techlympics stores this as `viblockChallengeId` |
| `name` | string | Human-readable challenge name |
| `description` | string | Short description shown to organisers |
| `challenge_mode` | string | Mode type (e.g. `"timed"`, `"score"`, `"ranked"`) |
| `status` | string | `"active"` \| `"draft"` \| `"archived"` |
| `order_index` | integer | Display order |

---

#### 5.3 List Competition Events *(Public — no API key)*

```
GET /competition/events
```

Returns active competition events on your platform. Techlympics calls this during walk-in registration to determine which event to register the competitor into. The result is cached for 60 seconds.

**Response `200 OK`:**
```json
{
  "events": [
    {
      "id": "evt_live001",
      "name": "Open Arena Session — August 2025",
      "status": "active",
      "challenge_id": "ch_abc123",
      "starts_at": "2025-08-10T09:00:00Z",
      "ends_at": "2025-08-10T17:00:00Z"
    }
  ]
}
```

Techlympics will pick the first `"active"` event. If multiple events are active simultaneously, ensure your API returns the correct one for the current period, or provide a configuration hook (contact us for custom event-selection logic).

---

#### 5.4 Register Competitor *(Public — no API key)*

```
POST /competition/register
```

Registers a participant into a competition event and returns a short token. This is the primary integration call — Techlympics calls this at counter check-in.

**Request body:**
```json
{
  "event_id": "evt_live001",
  "sector": "SMK Taman Melawati",
  "region": "Selangor",
  "name": "Ahmad bin Yusof"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `event_id` | string | Yes | The `id` from the active event returned by `/competition/events` |
| `sector` | string | Yes | Contingent name — used for grouping/display on your leaderboard |
| `region` | string | No | State name — used for grouping/display |
| `name` | string | Yes | Participant's full name |

**Response `201 Created`:**
```json
{
  "registration_id": "reg_xyz789",
  "token": "A4F2K",
  "event_id": "evt_live001"
}
```

| Field | Type | Description |
|---|---|---|
| `registration_id` | string | Your internal registration ID |
| `token` | string | Short alphanumeric token (5–8 characters). Shown to the participant to enter your platform |
| `event_id` | string | Echoes the event the competitor was registered into |

**Token constraints:**
- **Length:** 5–8 characters, uppercase alphanumeric only (no ambiguous characters: `0`, `O`, `I`, `1`)
- **Uniqueness:** Must be unique per active event
- **Expiry:** Tokens should be valid for the duration of the event. After the event ends, a `used` flag is acceptable but tokens should remain queryable for reporting.

**Response `409 Conflict`:** Participant already registered (same name + event). Return the existing registration including the existing token:
```json
{
  "registration_id": "reg_xyz789",
  "token": "A4F2K",
  "event_id": "evt_live001",
  "already_registered": true
}
```

---

#### 5.5 Get Token Info *(Public — no API key)*

```
GET /competition/tokens/{token}
```

Looks up a token's status. Used by Techlympics to display token validity to the organizer and optionally to the participant portal.

**Path parameter:** `token` — the 5–8 character token string.

**Response `200 OK`:**
```json
{
  "token": "A4F2K",
  "registration_id": "reg_xyz789",
  "event_id": "evt_live001",
  "event_name": "Open Arena Session — August 2025",
  "event_status": "active",
  "sector": "SMK Taman Melawati",
  "region": "Selangor",
  "name": "Ahmad bin Yusof",
  "user_id": "usr_internal",
  "created_at": "2025-08-10T10:15:00Z",
  "used_at": "2025-08-10T10:22:00Z",
  "is_used": true
}
```

| Field | Type | Description |
|---|---|---|
| `is_used` | boolean | Whether the participant has entered the token into your platform |
| `used_at` | ISO 8601 datetime \| null | When the token was first used (null if unused) |
| `event_status` | string | `"active"` \| `"completed"` \| `"cancelled"` |

**Response `404 Not Found`:** Token does not exist.

---

#### 5.6 Renew Token *(Public — no API key)*

```
POST /competition/tokens/{token}/renew
```

Issues a new token for the same registration. Called by Techlympics organizers when a participant has lost their token or the token has expired.

**Path parameter:** `token` — the existing token to renew.

**Request body:** `{}` (empty object)

**Response `200 OK`:**
```json
{
  "old_token": "A4F2K",
  "token": "B7G9M",
  "registration_id": "reg_xyz789",
  "event_id": "evt_live001",
  "sector": "SMK Taman Melawati",
  "region": "Selangor",
  "name": "Ahmad bin Yusof",
  "user_id": "usr_internal",
  "created_at": "2025-08-10T11:00:00Z"
}
```

The old token must be invalidated immediately. Only the new token should grant access going forward.

**Response `404 Not Found`:** Token not found.  
**Response `410 Gone`:** Registration has been cancelled or the event has ended.

---

## 6. Authentication

### Inbound (Your API → Techlympics calls you)

Every server-to-server request from Techlympics to your API includes:

```
X-API-Key: <your_api_key>
Content-Type: application/json
Accept: application/json
```

- The API key is a static secret you provide to the Techlympics team during onboarding.
- All requests with an invalid or missing API key must return `401 Unauthorized`.
- There is no OAuth flow — a single long-lived API key per integration.

**Recommended format:** prefix + 48 hex characters, e.g. `yourprefix_a1b2c3d4e5f6...` (similar to `eptdk_` or `vbk_` prefixes used by existing integrations).

### Outbound (Techlympics → your API)

Techlympics does not expose any inbound webhook endpoints for third-party systems to call. All data flows are initiated by Techlympics. If you need to push data (e.g. competition results) back to Techlympics, contact the platform team to discuss a results ingestion endpoint.

### Public Endpoints

The following endpoints in Pattern B must be accessible **without** an API key:

- `GET /competition/events`
- `POST /competition/register`
- `GET /competition/tokens/{token}`
- `POST /competition/tokens/{token}/renew`

These are called from Techlympics server-side but may also be called from browser clients. They must not require authentication beyond rate limiting.

---

## 7. Required API Endpoints — Summary

### Pattern A (Account-Based SSO)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/sectors/check/{customId}` | API Key | Check if sector exists |
| `POST` | `/sectors` | API Key | Create sector |
| `POST` | `/sectors/{customId}/members` | API Key | Add user to sector |
| `GET` | `/users/check/{userid}` | API Key | Check if user exists |
| `POST` | `/users` | API Key | Create user |
| `POST` | `/auth/token` | API Key | Issue SSO JWT |

### Pattern B (Token-Based Walk-in)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | API Key | Service health check |
| `GET` | `/challenges` | API Key | List competition challenges |
| `GET` | `/competition/events` | Public | List active competition events |
| `POST` | `/competition/register` | Public | Register competitor, issue token |
| `GET` | `/competition/tokens/{token}` | Public | Look up token status |
| `POST` | `/competition/tokens/{token}/renew` | Public | Renew/replace a token |

---

## 8. Data Formats

### General Rules

- All requests and responses use **JSON** (`Content-Type: application/json`).
- Datetimes use **ISO 8601** format in UTC: `2025-08-10T10:00:00Z`.
- String IDs may be any stable unique format (UUID, CUID, integer string). Do not use sequential integers that could be guessed.
- All text fields (names, descriptions) are UTF-8.

### IC Number (Pattern A)

The `userid` for individual participants is the participant's national ID number (IC) with all non-digit characters removed. For example:

| Raw IC | As `userid` |
|---|---|
| `020304-05-0607` | `020304050607` |
| `990101016543` | `990101016543` |

This means `userid` for participants is always a numeric string of 12 digits.

For **teams**, the `userid` is a 24-character CUID (e.g. `clxyz4567890abcdefghijkl`) — it begins with letters and is never 12 digits, so your system can distinguish participant accounts from team accounts if needed.

### Null vs. Absent Fields

- Fields marked "optional" in the request may be absent or `null`.
- Your API should treat both the same way (graceful ignore).
- Do not return `null` for required response fields — omit them if not applicable.

---

## 9. Error Handling

### Expected Status Codes

| Code | Meaning | Techlympics behaviour |
|---|---|---|
| `200 OK` | Success (GET, PATCH) | Normal flow continues |
| `201 Created` | Resource created | Normal flow continues |
| `400 Bad Request` | Invalid payload | Techlympics logs error, shows message to user |
| `401 Unauthorized` | Missing/invalid API key | Techlympics logs error, integration flagged as misconfigured |
| `404 Not Found` | Resource does not exist | Treated as "not yet created" for check endpoints |
| `409 Conflict` | Already exists | **Non-fatal** — Techlympics continues as if creation succeeded |
| `410 Gone` | Resource no longer valid | Techlympics shows error to organizer |
| `429 Too Many Requests` | Rate limit | Techlympics retries after 1 second (once) |
| `5xx` | Server error | Techlympics logs error, shows generic failure message |

### 409 Idempotency

Techlympics re-drives the full provisioning flow on retry (e.g. if a previous attempt partially failed). Your endpoints must be **idempotent** — calling `POST /sectors` with the same `custom_id` twice must be safe. Return `409` for the duplicate; Techlympics will proceed.

### Error Response Body

All error responses should include:

```json
{
  "error": "Short machine-readable code",
  "message": "Human-readable description for logging"
}
```

Example:
```json
{
  "error": "USER_ALREADY_EXISTS",
  "message": "A user with userid '020304050607' already exists"
}
```

### Timeouts

Techlympics enforces a **10-second timeout** on all outbound calls to your API. Ensure all endpoints respond within 5 seconds under normal load (to leave margin for network latency).

---

## 10. Configuration & Onboarding

### What You Provide to Techlympics

Provide the following to the Techlympics integration team:

| Item | Example |
|---|---|
| **Base URL** | `https://api.yourapp.ai/functions/v1/eptim-api` |
| **API Key** | `yourprefix_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0` |
| **App URL** (Pattern A only) | `https://yourapp.ai` — the URL participants are redirected to with `?access_token=` |
| **Pattern** | A or B |
| **Integration identifier** | A short slug, e.g. `"your-app-name"` — used as the value for `thirdPartyIntegration` on the Competition model |

### How Techlympics Configures Your Integration

1. The Techlympics team adds your environment variables to the deployment:
   - `YOURAPP_BASE_URL`
   - `YOURAPP_API_KEY`
   - `YOURAPP_APP_URL` (Pattern A only)

2. Your integration identifier is set as `thirdPartyIntegration` on each Competition that should use your platform. This is done by the Techlympics admin team, not by your team.

3. For Pattern B: your integration toggle appears in the organizer's Walk-in Competition management panel. Organisers switch it on per-competition.

### What Participants See

**Pattern A:**  
A button appears on the participant's Team page (only when their team is in a competition linked to your integration). Clicking it:
- Provisions accounts silently (first time).
- Opens your platform in a new browser tab, pre-authenticated via `?access_token=`.

**Pattern B:**  
At the physical check-in counter, after a participant is confirmed, a 5–8 character token is printed or shown on screen. The participant enters this token into your platform's entry interface (kiosk, mobile app, etc.).

---

## 11. Lifecycle Diagrams

### Pattern A — First-time Registration and SSO Login

```
Participant                  Techlympics                    Your API
     │                           │                              │
     │  Click "Enter [App]"       │                              │
     │ ─────────────────────────►│                              │
     │                           │                              │
     │                           │  GET /sectors/check/{id}     │
     │                           │ ────────────────────────────►│
     │                           │◄──── { available: true } ────│
     │                           │                              │
     │                           │  POST /sectors               │
     │                           │ ────────────────────────────►│
     │                           │◄──── { id, custom_id } ──────│
     │                           │                              │
     │                           │  GET /users/check/{userid}   │
     │                           │ ────────────────────────────►│
     │                           │◄──── { available: true } ────│
     │                           │                              │
     │                           │  POST /users                 │
     │                           │ ────────────────────────────►│
     │                           │◄──── { id, userid } ─────────│
     │                           │                              │
     │                           │  POST /sectors/{id}/members  │
     │                           │ ────────────────────────────►│
     │                           │◄──── { sector_id, user_id } ─│
     │                           │                              │
     │                           │  [save DroneAccess to DB]    │
     │                           │                              │
     │  Redirect to Your App      │                              │
     │◄─────────────────────────  │  POST /auth/token            │
     │  ?access_token=eyJ...      │ ────────────────────────────►│
     │                            │◄──── { access_token } ───────│
     │                            │                              │
     │ ═══════════════════════════════════════════════════════   │
     │   Browser opens yourapp.ai?access_token=eyJ...           │
     │   Your frontend reads token → session established        │
```

On subsequent logins, the sector/user provisioning is skipped (accounts already exist, 409 is returned and absorbed). Only `POST /auth/token` is called.

---

### Pattern B — Walk-in Registration and Token Issuance

```
Participant      Counter Operator          Techlympics              Your API
     │                  │                      │                        │
     │  Arrive at        │                      │                        │
     │  counter          │                      │                        │
     │ ────────────────►│                      │                        │
     │                  │  Scan participant    │                        │
     │                  │  ID / search name    │                        │
     │                  │ ────────────────────►│                        │
     │                  │◄─ participant found ─│                        │
     │                  │                      │                        │
     │                  │  Click "Confirm"     │                        │
     │                  │ ────────────────────►│                        │
     │                  │                      │  GET /competition/events│
     │                  │                      │ ───────────────────────►│
     │                  │                      │◄─ { events: [...] } ───│
     │                  │                      │                        │
     │                  │                      │  POST /competition/     │
     │                  │                      │       register         │
     │                  │                      │ ───────────────────────►│
     │                  │                      │◄─ { token: "A4F2K" } ──│
     │                  │                      │                        │
     │                  │◄─ Registration confirmed + token shown ───────│
     │                  │                      │                        │
     │◄─────────────────│                      │                        │
     │  Shown token:     │                      │                        │
     │  "A4F2K"          │                      │                        │
     │                  │                      │                        │
     │  Enter "A4F2K"    │                      │                        │
     │  into Your App    │                      │                        │
     │ ═══════════════════════════════════════════════════════════════   │
     │   Your platform authenticates the token and starts the session   │
```

---

## 12. Testing Checklist

Before going live, verify that your API satisfies all the following requirements.

### Pattern A

- [ ] `GET /sectors/check/{id}` returns `{ available: true }` for a non-existent ID
- [ ] `POST /sectors` creates a sector and returns `custom_id` in the response
- [ ] `GET /sectors/check/{id}` returns `{ available: false }` after creation
- [ ] `POST /sectors` with the same `custom_id` returns `409` (not `500`)
- [ ] `GET /users/check/{userid}` returns `{ available: true }` for a non-existent user
- [ ] `POST /users` creates a user with the provided `userid` and `password`
- [ ] `GET /users/check/{userid}` returns `{ available: false }` after creation
- [ ] `POST /users` with the same `userid` returns `409` (not `500`)
- [ ] `POST /sectors/{customId}/members` links user to sector
- [ ] `POST /sectors/{customId}/members` with duplicate member returns `409`
- [ ] `POST /auth/token` with correct credentials returns `access_token`
- [ ] `POST /auth/token` with wrong password returns `401`
- [ ] `access_token` is a valid JWT parseable by standard libraries
- [ ] Redirecting browser to `{APP_URL}?access_token={token}` establishes an authenticated session
- [ ] All authenticated endpoints return `401` when `X-API-Key` header is missing or incorrect
- [ ] All endpoints respond within 5 seconds

### Pattern B

- [ ] `GET /health` returns `200` with `{ "status": "ok" }`
- [ ] `GET /challenges` returns a list with at least one active challenge
- [ ] `GET /competition/events` returns active events without any auth header
- [ ] `POST /competition/register` returns a token of 5–8 uppercase alphanumeric characters
- [ ] Token does not contain ambiguous characters (`0`, `O`, `I`, `1`, `l`)
- [ ] `POST /competition/register` with the same name + event returns `409` with the existing token
- [ ] `GET /competition/tokens/{token}` returns full token info
- [ ] `GET /competition/tokens/{nonexistent}` returns `404`
- [ ] `is_used` changes from `false` to `true` after the token is used in your platform
- [ ] `POST /competition/tokens/{token}/renew` returns a new token
- [ ] Old token is invalidated after renewal (returns `is_used: true` or a `410`)
- [ ] Public endpoints work correctly without `X-API-Key` header
- [ ] Authenticated endpoints return `401` without `X-API-Key`
- [ ] All endpoints respond within 5 seconds

---

## 13. Contact

For integration requests, technical questions, or to provide your API credentials, contact the Techlympics platform team:

- **Email:** mahza13@gmail.com
- **Platform:** [techlympics.my](https://techlympics.my)

Please include the following in your initial contact:

1. Your platform name and short description
2. Which integration pattern (A or B) you are implementing
3. Your `BASE_URL` (staging environment for initial testing)
4. Your proposed `integration_identifier` slug
5. Estimated timeline for API readiness

The Techlympics team will provision a staging environment key and coordinate a test drive before enabling the integration in production.

---

*This document covers the integration interface as of Malaysia Techlympics Platform v2. The platform reserves the right to version and extend these APIs. Breaking changes will be communicated with a minimum 30-day notice.*
