import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── GET — list participants whose IC ends with 00000 ───────────────────────────

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map(c => c.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ data: [] });

  const participants = await db.participant.findMany({
    where: {
      contingentId: { in: contingentIds },
      ic: { endsWith: "00000" },
    },
    select: {
      id: true, name: true, ic: true,
      gender: true, eduLevel: true, classGrade: true, ethnicity: true,
    },
    orderBy: [{ classGrade: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ data: participants });
}

// ── POST — AI-extract ICs from free text / CSV and match to participants ───────

const SYSTEM_PROMPT = `You are an IC number extraction assistant for a Malaysian student registration system.
You are given a list of participant names and a source text (free text, CSV, or table) that contains IC numbers.
Extract IC numbers and match them to participant names.

Rules:
- Malaysian IC format: 12 digits YYMMDDPBNNN# — output digits ONLY, no dashes, no spaces.
- Match participant names case-insensitively. Allow minor spelling differences (typos, missing bin/binti).
- Only include a match if you are reasonably confident.
- If the source text contains a row with a name AND an IC, match them.
- Return ONLY a valid JSON array, no markdown, no explanation.

Output format: [{"participantId":"...","ic":"012345678901"}]`;

function extractJsonArray(text: string): string {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const s = cleaned.indexOf("[");
  const e = cleaned.lastIndexOf("]");
  return s !== -1 && e !== -1 ? cleaned.slice(s, e + 1) : cleaned;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map(c => c.contingentId);
  const { text, participants } = await req.json() as {
    text: string;
    participants: { id: string; name: string }[];
  };

  if (!text?.trim()) return NextResponse.json({ suggestions: [] });

  // Only allow matching against participants that actually belong to this manager
  const allowedIds = new Set(
    (await db.participant.findMany({
      where: { contingentId: { in: contingentIds } },
      select: { id: true },
    })).map(p => p.id)
  );
  const safeParticipants = participants.filter(p => allowedIds.has(p.id));
  if (safeParticipants.length === 0) return NextResponse.json({ suggestions: [] });

  const participantList = safeParticipants
    .map(p => `  {"participantId":"${p.id}","name":"${p.name.replace(/"/g, "'")}"}`)
    .join("\n");

  const userPrompt = `Participant list:\n[\n${participantList}\n]\n\nSource text:\n${text.slice(0, 8000)}`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(userPrompt);
  const raw = result.response.text();

  let suggestions: { participantId: string; ic: string }[] = [];
  try {
    const parsed = JSON.parse(extractJsonArray(raw));
    if (Array.isArray(parsed)) {
      suggestions = parsed
        .filter((x): x is { participantId: string; ic: string } =>
          typeof x?.participantId === "string" &&
          typeof x?.ic === "string" &&
          /^\d{12}$/.test(x.ic.replace(/[-\s]/g, "")) &&
          allowedIds.has(x.participantId)
        )
        .map(x => ({ participantId: x.participantId, ic: x.ic.replace(/[-\s]/g, "") }));
    }
  } catch {
    return NextResponse.json({ error: "PARSE_ERROR", raw }, { status: 500 });
  }

  return NextResponse.json({ suggestions });
}
