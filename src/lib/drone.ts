const BASE_URL   = (process.env.WALKIN_EPTIM_DRONE_URL ?? "").replace(/\/$/, "");
const API_KEY    = process.env.WALKIN_EPTIM_DRONE_API_KEY ?? "";
const TIMEOUT_MS = 12_000;

export function droneConfigured() { return !!API_KEY && !!BASE_URL; }

/** Derive a stable lowercase userid for a participant from their participantId. */
export function deriveDroneUserId(participantId: string): string {
  return `dr${participantId.slice(-10)}`;
}

/**
 * Derive a deterministic password for a given userid using the API key as the secret.
 * Ensures repeated registration attempts always produce the same credentials.
 */
export async function deriveDronePassword(userid: string): Promise<string> {
  const data = new TextEncoder().encode(`${API_KEY}:drone:${userid}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, (_, i) => charset[bytes[i] % charset.length]).join("");
}

/**
 * Encoded composite stored in viblockToken field.
 * Format: "userid|password|accessToken" (3 parts) — no competition token
 *      or "userid|password|accessToken|competitionToken|endpointId" (5 parts) — with terminal token
 */
export function encodeDroneToken(
  userid: string,
  password: string,
  accessToken: string,
  competitionToken?: string,
  endpointId?: string,
): string {
  if (competitionToken && endpointId) {
    return `${userid}|${password}|${accessToken}|${competitionToken}|${endpointId}`;
  }
  return `${userid}|${password}|${accessToken}`;
}

export function parseDroneToken(stored: string): {
  userid: string;
  password: string;
  accessToken: string;
  competitionToken: string | null;
  endpointId: string | null;
} | null {
  const parts = stored.split("|");
  if (parts.length !== 3 && parts.length !== 5) return null;
  const [userid, password, accessToken] = parts;
  if (!userid || !password || !accessToken) return null;
  return {
    userid,
    password,
    accessToken,
    competitionToken: parts.length === 5 ? (parts[3] || null) : null,
    endpointId:       parts.length === 5 ? (parts[4] || null) : null,
  };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE_URL || !API_KEY) {
    throw Object.assign(
      new Error("WALKIN_EPTIM_DRONE_URL or WALKIN_EPTIM_DRONE_API_KEY not configured"),
      { status: 503 },
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const hasBody = body !== undefined;
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "X-API-Key": API_KEY,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text().catch(() => "");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      throw Object.assign(
        new Error(`Drone API returned non-JSON (${res.status}): ${text.slice(0, 200)}`),
        { status: 422 },
      );
    }

    if (!res.ok) {
      const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Ignore 409 Conflict (resource already exists) */
function ignore409(e: unknown) {
  if ((e as { status?: number }).status === 409) return;
  throw e;
}

export async function droneRegisterParticipant(opts: {
  sectorName: string;
  sectorRegion: string;
  sectorCustomId: string;
  userid: string;
  fullName: string;
}): Promise<{ userid: string; password: string; accessToken: string }> {
  // Supabase Auth normalises emails to lowercase, so the synthetic email stored for a
  // userid-created account is always "{userid.toLowerCase()}@api.eptim.ai".
  // Use lowercase for ALL drone API calls to avoid lookup mismatches.
  const userid = opts.userid.toLowerCase();

  // Password is deterministic (API_KEY + userid) so retries always produce the same
  // credentials regardless of prior failed attempts.
  const password = await deriveDronePassword(userid);

  // 1. Create sector (409 = already exists → ok)
  await req("POST", "/sectors", {
    sector_name: opts.sectorName,
    region: opts.sectorRegion,
    custom_id: opts.sectorCustomId,
  }).catch(ignore409);

  const tryRegister = async (uid: string, pwd: string) => {
    // 2. Create user — capture the actual email from the 201 response.
    // On 409 (user already exists), fall back to the synthetic email formula.
    let userEmail: string = `${uid}@api.eptim.ai`;
    try {
      const userResp = await req<{ id: string; email: string }>("POST", "/users", {
        userid: uid,
        password: pwd,
        full_name: opts.fullName,
      });
      if (userResp.email) userEmail = userResp.email;
    } catch (e) {
      ignore409(e); // re-throws if not 409
    }

    // 3. Assign user to sector. Try email first, then userid.
    // On 404 (user lookup inconsistency in the drone API), do NOT throw — the auth token
    // call below is the definitive check of whether the user is truly registered.
    let assignedOk = false;
    try {
      await req("POST", `/sectors/${encodeURIComponent(opts.sectorCustomId)}/members`, {
        email: userEmail,
      }).catch(ignore409);
      assignedOk = true;
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
      try {
        await req("POST", `/sectors/${encodeURIComponent(opts.sectorCustomId)}/members`, {
          userid: uid,
        }).catch(ignore409);
        assignedOk = true;
      } catch (e2) {
        if ((e2 as { status?: number }).status !== 404) throw e2;
      }
    }

    // 4. Auth token — definitive: succeeds only if user exists AND is sector-assigned.
    const authBody = { userid: uid, password: pwd };
    try {
      const { access_token } = await req<{ access_token: string }>("POST", "/auth/token", authBody);
      return { userid: uid, password: pwd, accessToken: access_token };
    } catch (authErr) {
      const s = (authErr as { status?: number }).status;
      // 403 = user exists but not yet assigned; retry assign then re-auth
      if (s === 403 && !assignedOk) {
        await req("POST", `/sectors/${encodeURIComponent(opts.sectorCustomId)}/members`, {
          userid: uid,
        }).catch(ignore409);
        const { access_token } = await req<{ access_token: string }>("POST", "/auth/token", authBody);
        return { userid: uid, password: pwd, accessToken: access_token };
      }
      throw authErr;
    }
  };

  try {
    return await tryRegister(userid, password);
  } catch (e) {
    // 401 = user exists on eptim-drone with different credentials (a prior failed attempt
    // created them with a random password we never stored). Fall back to a suffixed userid
    // so this participant gets a fresh, usable account.
    if ((e as { status?: number }).status !== 401) throw e;
    const altUserid = `${userid}a`;
    const altPassword = await deriveDronePassword(altUserid);
    return await tryRegister(altUserid, altPassword);
  }
}

export async function droneRefreshToken(userid: string, password: string): Promise<string> {
  const { access_token } = await req<{ access_token: string }>("POST", "/auth/token", {
    userid: userid.toLowerCase(),
    password,
  });
  return access_token;
}

export async function droneListChallenges(): Promise<{
  challenges: Array<{ id: string; name: string; status: string }>;
}> {
  return req<{ challenges: Array<{ id: string; name: string; status: string }> }>(
    "GET",
    "/challenges?status=published",
  );
}

export async function droneListEndpoints(): Promise<{
  event_id: string;
  endpoints: Array<{ id: string; name: string; is_active: boolean; passcode_prefix: string; challenge_id?: string }>;
}> {
  return req<{ event_id: string; endpoints: Array<{ id: string; name: string; is_active: boolean; passcode_prefix: string; challenge_id?: string }> }>(
    "GET",
    "/endpoints",
  );
}

/** Generate a single-use 6-char terminal token for a participant. 409 → token already exists. */
export async function droneGenerateCompetitionToken(
  endpointId: string,
  userid: string,
): Promise<{ token: string }> {
  return req<{ token: string }>(
    "POST",
    `/endpoints/${encodeURIComponent(endpointId)}/tokens`,
    { userid: userid.toLowerCase() },
  );
}

/** Replace an existing token with a new one (participant lost their token). */
export async function droneRegenerateCompetitionToken(
  endpointId: string,
  userid: string,
): Promise<{ token: string }> {
  return req<{ token: string }>(
    "PUT",
    `/endpoints/${encodeURIComponent(endpointId)}/tokens/${encodeURIComponent(userid.toLowerCase())}`,
  );
}

/**
 * Get or create a competition terminal token for a participant.
 * Tries POST first; if 409 (already exists), falls back to PUT (regenerate).
 */
export async function droneGetOrCreateCompetitionToken(
  endpointId: string,
  userid: string,
): Promise<{ token: string }> {
  try {
    return await droneGenerateCompetitionToken(endpointId, userid);
  } catch (e) {
    if ((e as { status?: number }).status === 409) {
      return droneRegenerateCompetitionToken(endpointId, userid);
    }
    throw e;
  }
}
