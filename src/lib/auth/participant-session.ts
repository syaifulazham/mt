import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE = "pt_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type ParticipantCtx = {
  sessionId:     string;
  participantId: string;
  name:          string;
  ic:            string | null;
  gender:        string;
  age:           number | null;
  eduLevel:      string;
  classGrade:    string | null;
  className:     string | null;
  contingentId:  string;
  ppki:          boolean;
};

export async function getParticipantSession(): Promise<ParticipantCtx | null> {
  const jar   = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.participantSession.findUnique({
    where: { token },
    include: {
      participant: {
        select: {
          id: true, name: true, ic: true, gender: true, age: true,
          eduLevel: true, classGrade: true, className: true,
          contingentId: true, ppki: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await db.participantSession.delete({ where: { id: session.id } });
    return null;
  }

  const p = session.participant;
  return {
    sessionId:    session.id,
    participantId: p.id,
    name:         p.name,
    ic:           p.ic,
    gender:       p.gender,
    age:          p.age,
    eduLevel:     p.eduLevel,
    classGrade:   p.classGrade,
    className:    p.className,
    contingentId: p.contingentId,
    ppki:         p.ppki,
  };
}

export async function createParticipantSession(participantId: string): Promise<string> {
  const session = await db.participantSession.create({
    data: {
      participantId,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return session.token;
}

export async function deleteParticipantSession(token: string) {
  await db.participantSession.deleteMany({ where: { token } });
}

export function participantSessionCookieOptions(token: string) {
  return {
    name:     COOKIE,
    value:    token,
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path:     "/",
    maxAge:   TTL_MS / 1000,
  };
}

export function clearParticipantSessionCookie() {
  return {
    name:    COOKIE,
    value:   "",
    httpOnly: true,
    path:    "/",
    maxAge:  0,
  };
}
