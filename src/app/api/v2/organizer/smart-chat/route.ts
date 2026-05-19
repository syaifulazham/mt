import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Smart Chat, an intelligent assistant for the Techlympics organizer portal (Malaysia). You help organizers search, view, and manage competition data.

SUPPORTED ENTITIES:
- Participant (peserta/contestant): name, ic (12-digit NRIC), gender, age, eduLevel (PRIMARY/SECONDARY/YOUTH), classGrade, contingent, ppki (boolean — true if PPKI/special-needs participant)
- Trainer (jurulatih): name, ic, email, phoneNumber, contingent, status
- Manager (pengurus): name, email, phone, idNumber, school or institution, contingents managed
- Contingent (kontingen): name, shortName, contingentType (SCHOOL/HIGHER/INDEPENDENT/INTERNATIONAL)
- School (sekolah): name, code, state, level (PRIMARY/SECONDARY/SPECIAL), category
- Team (pasukan): name, competition, contingent, members
- Event (acara/event): name, slug, scope, status, startDate, endDate
- Competition (pertandingan): name, code, participationType

SEARCH INTENTS — use when looking for specific records:
SEARCH_PARTICIPANT, SEARCH_TRAINER, SEARCH_MANAGER, SEARCH_CONTINGENT, SEARCH_SCHOOL, SEARCH_TEAM, SEARCH_EVENT, SEARCH_IC, SEARCH_COMPETITION

COUNT/AGGREGATE INTENTS — use when user asks quantity ("berapa/how many/jumlah/bilangan/total"):
COUNT_CONTINGENT, COUNT_PARTICIPANT, COUNT_TRAINER, COUNT_TEAM, COUNT_SCHOOL, COUNT_EVENT, COUNT_MANAGER, COUNT_COMPETITION

OTHER INTENTS: CLARIFY, GENERAL

ACTIONS — return exactly one:
SEARCH (default), UPDATE (kemaskini/tukar/update/edit), DELETE (remove/padam/buang/delete/hapus)

PARAMS for SEARCH intents (include only relevant ones):
- name: partial name to match (OMIT for list-all queries like "senarai/list/senaraikan")
- schoolName: (SEARCH_MANAGER, SEARCH_SCHOOL) name of the school — use when user asks "pengurus sekolah X" or "siapakah pengurus X" where X is a school
- contingentName: (SEARCH_MANAGER) find managers of a specific contingent by name
- hasParticipants: true — (SEARCH_CONTINGENT only) filter contingents that have enrolled participants
- contingentType: "SCHOOL"|"HIGHER"|"INDEPENDENT"|"INTERNATIONAL"
- state: filter by state name (e.g. "Selangor")
- competitionName: filter teams/events by competition name

PARAMS for COUNT intents (include only relevant ones):
- status: "ACTIVE"|"INACTIVE"|"SUSPENDED"|"DRAFT"|"PUBLISHED"
- gender: "MALE"|"FEMALE" (participants)
- ppki: true|false — filter participants by PPKI status ("ppki participants" → ppki=true)
- contingentType: "SCHOOL"|"HIGHER"|"INDEPENDENT"|"INTERNATIONAL"
- contingentName: filter by contingent
- state: filter by state name (e.g. "Selangor")
- competitionName: filter by competition name
- zone: filter by zone name (e.g. "Tengah", "Utara") — separate from state

RULES:
1. Any sequence of 5+ digits in user input → SEARCH_IC, extract those digits as ic param
2. "berapa/how many/jumlah/bilangan/total" → use COUNT_* intent, NOT SEARCH_*
3. "senarai/list/senaraikan/semua" without a specific name → SEARCH_* intent with name=null (server returns paginated list)
4. "mendaftarkan peserta / ada peserta" modifying a contingent list → SEARCH_CONTINGENT + params.hasParticipants=true
5. "siapakah pengurus sekolah X" / "pengurus X" where X looks like a school name → SEARCH_MANAGER + params.schoolName="X" (NOT params.name)
6. "kemaskini/tukar peserta X" → SEARCH_PARTICIPANT + action=UPDATE
7. "remove/padam peserta X" → SEARCH_PARTICIPANT + action=DELETE
8. Entity type unclear → CLARIFY
8. Answer in the same language as the user (Malay or English)
9. For COUNT intents set reply to "Sedang mengira..." — server will fill in the actual number

EXAMPLES:
"how many ppki participants" → COUNT_PARTICIPANT + params.ppki=true
"ada berapa kontingen" → COUNT_CONTINGENT
"berapa peserta lelaki" → COUNT_PARTICIPANT + params.gender="MALE"
"how many active events" → COUNT_EVENT + params.status="ACTIVE"
"berapa pasukan dalam pertandingan robotik" → COUNT_TEAM + params.competitionName="robotik"
"ada berapa pertandingan yang telah direkodkan" → COUNT_COMPETITION
"senarai pertandingan" → SEARCH_COMPETITION with name=null

YOU MUST respond with ONLY valid JSON (no markdown, no explanation):
{"intent":"SEARCH_PARTICIPANT","action":"SEARCH","params":{"name":"ahmad","ic":null,"contingentName":null,"schoolName":null,"competitionName":null,"limit":10},"reply":"Mencari peserta bernama Ahmad...","needsClarification":false,"clarificationQuestion":null}`;

// ── Types ──────────────────────────────────────────────────────────────────────

type Intent =
  | "SEARCH_PARTICIPANT" | "SEARCH_TRAINER" | "SEARCH_MANAGER"
  | "SEARCH_CONTINGENT" | "SEARCH_SCHOOL" | "SEARCH_TEAM"
  | "SEARCH_EVENT" | "SEARCH_IC" | "SEARCH_COMPETITION"
  | "COUNT_CONTINGENT" | "COUNT_PARTICIPANT" | "COUNT_TRAINER"
  | "COUNT_TEAM" | "COUNT_SCHOOL" | "COUNT_EVENT" | "COUNT_MANAGER" | "COUNT_COMPETITION"
  | "CLARIFY" | "GENERAL";

type Action = "SEARCH" | "UPDATE" | "DELETE";

interface AiResponse {
  intent: Intent;
  action: Action;
  params: {
    name?: string | null;
    ic?: string | null;
    contingentName?: string | null;
    schoolName?: string | null;
    competitionName?: string | null;
    limit?: number;
    status?: string | null;
    gender?: string | null;
    contingentType?: string | null;
    state?: string | null;
    zone?: string | null;
    ppki?: boolean | null;
    hasParticipants?: boolean | null;
  };
  reply: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

interface CountResult {
  _isCount: true;
  total: number;
  label: string;
  breakdown?: { label: string; count: number }[];
}

type Msg = { role: string; content: string };

// ── JSON extractor ─────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  return s !== -1 && e !== -1 ? cleaned.slice(s, e + 1) : cleaned;
}

// ── KB retrieval ───────────────────────────────────────────────────────────────

const KB_STOP_WORDS = new Set([
  "yang","dan","untuk","dalam","dari","dengan","ini","itu","ada","adalah","tidak",
  "bagi","atau","pada","kepada","oleh","akan","sudah","juga","saya","kami","kita",
  "the","and","for","with","this","that","have","are","was","were","how","many",
  "what","who","where","when","there","their","they","been","has","had","but","not",
  "berapa","siapa","apakah","bagaimana","boleh","tolong","cari","list","senarai",
]);

async function searchKb(userText: string): Promise<{ title: string; path: string; content: string }[]> {
  const keywords = userText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !KB_STOP_WORDS.has(w))
    .slice(0, 8);

  if (keywords.length === 0) return [];

  const articles = await db.knowledgeBase.findMany({
    where: {
      OR: keywords.flatMap(kw => [
        { title:   { contains: kw, mode: "insensitive" as const } },
        { content: { contains: kw, mode: "insensitive" as const } },
      ]),
    },
    select: { title: true, path: true, content: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  // Score by number of keyword hits in title+content and return top 3
  const scored = articles.map(a => {
    const haystack = (a.title + " " + a.content).toLowerCase();
    const hits = keywords.filter(kw => haystack.includes(kw)).length;
    return { ...a, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 3);
}

function buildKbBlock(articles: { title: string; path: string; content: string }[]): string {
  if (articles.length === 0) return "";
  const sections = articles.map(a =>
    `### ${a.title} (${a.path})\n${a.content.slice(0, 1200)}`
  ).join("\n\n---\n\n");
  return `\n\n[KNOWLEDGE BASE CONTEXT — use this to answer questions about events/competitions]\n${sections}\n[/KNOWLEDGE BASE CONTEXT]`;
}

// ── AI callers ─────────────────────────────────────────────────────────────────

async function callGemini(messages: Msg[], kbBlock: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : ("user" as "user" | "model"),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const last = messages[messages.length - 1];
  const result = await chat.sendMessage(last.content + kbBlock);
  return { content: result.response.text(), meta: null };
}

async function callEptim(messages: Msg[], kbBlock: string) {
  const lastWithKb: Msg[] = messages.map((m, i) =>
    i === messages.length - 1 && kbBlock
      ? { ...m, content: m.content + kbBlock }
      : m
  );
  const primed: Msg[] = [
    {
      role: "user",
      content: `[SYSTEM INSTRUCTIONS]\n${SYSTEM_PROMPT}\n[/SYSTEM INSTRUCTIONS]\n\nConfirm you understand and are ready.`,
    },
    {
      role: "assistant",
      content: JSON.stringify({
        intent: "GENERAL", action: "SEARCH", params: {},
        reply: "Saya faham. Saya akan membantu sebagai Smart Chat dan membalas dengan JSON sahaja.",
        needsClarification: false, clarificationQuestion: null,
      }),
    },
    ...lastWithKb,
  ];

  const res = await fetch(`${process.env.EPTIM_URL}/v1/consensus`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": process.env.EPTIM_API_KEY! },
    body: JSON.stringify({ messages: primed }),
  });

  if (!res.ok) throw new Error(`Eptim ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    content: data.content as string,
    meta: {
      epistemic_state: data.epistemic_state as string | undefined,
      consensus_score: data.consensus_score as number | undefined,
      hallucination_risk: data.hallucination_risk as number | undefined,
    },
  };
}

// ── DB query executor ──────────────────────────────────────────────────────────

async function runQuery(
  intent: Intent,
  params: AiResponse["params"],
  page = 1,
  pageSize = 10,
): Promise<{ items: unknown[]; total: number } | CountResult> {
  const skip = Math.max(0, (page - 1) * pageSize);
  const take = pageSize;
  const name = params.name?.trim() || null;
  const ic   = params.ic?.replace(/\D/g, "") || null;

  switch (intent) {

    case "COUNT_CONTINGENT": {
      const where: Prisma.ContingentWhereInput = {
        ...(params.status       && { status: params.status as Prisma.EnumContingentStatusFilter }),
        ...(params.contingentType && { contingentType: params.contingentType as Prisma.EnumContingentTypeFilter }),
        ...(params.state        && { state: { name: { contains: params.state, mode: "insensitive" } } }),
      };
      const [total, byType] = await Promise.all([
        db.contingent.count({ where }),
        db.contingent.groupBy({ by: ["contingentType"], where, _count: { id: true } }),
      ]);
      return {
        _isCount: true,
        total,
        label: "kontingen",
        breakdown: byType.map(r => ({ label: r.contingentType, count: r._count.id })),
      };
    }

    case "COUNT_PARTICIPANT": {
      const where: Prisma.ParticipantWhereInput = {
        ...(params.gender       && { gender: params.gender as Prisma.EnumGenderFilter }),
        ...(params.status       && { status: params.status }),
        ...(params.ppki  != null && { ppki: params.ppki }),
        ...(params.contingentName && { contingent: { name: { contains: params.contingentName, mode: "insensitive" } } }),
        ...(params.state        && { contingent: { state: { name: { contains: params.state, mode: "insensitive" } } } }),
      };
      const [total, byEduLevel] = await Promise.all([
        db.participant.count({ where }),
        db.participant.groupBy({ by: ["eduLevel"], where, _count: { id: true } }),
      ]);
      return {
        _isCount: true,
        total,
        label: "peserta",
        breakdown: byEduLevel.map(r => ({ label: r.eduLevel ?? "Tidak ditentukan", count: r._count.id })),
      };
    }

    case "COUNT_TRAINER": {
      const where: Prisma.TrainerWhereInput = {
        ...(params.status       && { status: params.status }),
        ...(params.contingentName && { contingent: { name: { contains: params.contingentName, mode: "insensitive" } } }),
        ...(params.state        && { contingent: { state: { name: { contains: params.state, mode: "insensitive" } } } }),
      };
      const total = await db.trainer.count({ where });
      return { _isCount: true, total, label: "jurulatih" };
    }

    case "COUNT_TEAM": {
      const where: Prisma.TeamWhereInput = {
        ...(params.competitionName && { competition: { name: { contains: params.competitionName, mode: "insensitive" } } }),
        ...(params.contingentName  && { contingent:  { name: { contains: params.contingentName,  mode: "insensitive" } } }),
        ...(params.state           && { contingent:  { state: { name: { contains: params.state, mode: "insensitive" } } } }),
      };
      const total = await db.team.count({ where });
      return { _isCount: true, total, label: "pasukan" };
    }

    case "COUNT_SCHOOL": {
      const where: Prisma.SchoolWhereInput = {
        ...(params.state && { state: { name: { contains: params.state, mode: "insensitive" } } }),
      };
      const [total, byLevel] = await Promise.all([
        db.school.count({ where }),
        db.school.groupBy({ by: ["level"], where, _count: { id: true } }),
      ]);
      return {
        _isCount: true,
        total,
        label: "sekolah",
        breakdown: byLevel.map(r => ({ label: r.level ?? "Lain-lain", count: r._count.id })),
      };
    }

    case "COUNT_EVENT": {
      const where: Prisma.EventWhereInput = {
        ...(params.status && { status: params.status as Prisma.EnumEventStatusFilter }),
        ...(params.state  && { state: { name: { contains: params.state, mode: "insensitive" } } }),
      };
      const [total, byStatus] = await Promise.all([
        db.event.count({ where }),
        db.event.groupBy({ by: ["status"], where, _count: { id: true } }),
      ]);
      return {
        _isCount: true,
        total,
        label: "acara",
        breakdown: byStatus.map(r => ({ label: r.status, count: r._count.id })),
      };
    }

    case "COUNT_MANAGER": {
      const where: Prisma.ManagerProfileWhereInput = {
        ...(params.contingentName && {
          contingentManagers: { some: { contingent: { name: { contains: params.contingentName, mode: "insensitive" } }, status: "ACTIVE" } },
        }),
      };
      const total = await db.managerProfile.count({ where });
      return { _isCount: true, total, label: "pengurus" };
    }

    case "COUNT_COMPETITION": {
      const where: Prisma.CompetitionWhereInput = {
        ...(params.competitionName && { name: { contains: params.competitionName, mode: "insensitive" } }),
        ...(params.zone && {
          eventCompetitions: { some: { event: { zone: { name: { contains: params.zone, mode: "insensitive" } } } } },
        }),
        ...(params.state && {
          eventCompetitions: { some: { event: { state: { name: { contains: params.state, mode: "insensitive" } } } } },
        }),
      };
      const [total, byType] = await Promise.all([
        db.competition.count({ where }),
        db.competition.groupBy({ by: ["participationType"], where, _count: { id: true } }),
      ]);
      return {
        _isCount: true,
        total,
        label: "pertandingan",
        breakdown: byType.map(r => ({ label: r.participationType ?? "Lain-lain", count: r._count.id })),
      };
    }

    case "SEARCH_PARTICIPANT": {
      if (!name && !ic && params.ppki == null) return { items: [], total: 0 };
      const where: Prisma.ParticipantWhereInput = {
        AND: [
          name ? { name: { contains: name, mode: "insensitive" } } : {},
          ic   ? { ic:   { contains: ic } }                        : {},
          params.ppki  != null ? { ppki: params.ppki }             : {},
          params.contingentName
            ? { contingent: { name: { contains: params.contingentName, mode: "insensitive" } } }
            : {},
        ],
      };
      const [total, rows] = await Promise.all([
        db.participant.count({ where }),
        db.participant.findMany({
          where,
          include: { contingent: { select: { id: true, name: true, contingentType: true } } },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "participant" })), total };
    }

    case "SEARCH_TRAINER": {
      if (!name && !ic) return { items: [], total: 0 };
      const where: Prisma.TrainerWhereInput = {
        AND: [
          name ? { name: { contains: name, mode: "insensitive" } } : {},
          ic   ? { ic:   { contains: ic } }                        : {},
          params.contingentName
            ? { contingent: { name: { contains: params.contingentName, mode: "insensitive" } } }
            : {},
        ],
      };
      const [total, rows] = await Promise.all([
        db.trainer.count({ where }),
        db.trainer.findMany({
          where,
          include: { contingent: { select: { id: true, name: true, contingentType: true } } },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "trainer" })), total };
    }

    case "SEARCH_IC": {
      if (!ic) return { items: [], total: 0 };
      const [participants, trainers] = await Promise.all([
        db.participant.findMany({
          where: { ic: { contains: ic } },
          include: { contingent: { select: { id: true, name: true, contingentType: true } } },
          take: 5,
        }),
        db.trainer.findMany({
          where: { ic: { contains: ic } },
          include: { contingent: { select: { id: true, name: true, contingentType: true } } },
          take: 5,
        }),
      ]);
      const items = [
        ...participants.map(e => ({ ...e, _type: "participant" })),
        ...trainers.map(e => ({ ...e, _type: "trainer" })),
      ];
      return { items, total: items.length };
    }

    case "SEARCH_MANAGER": {
      const sn = params.schoolName?.trim() || null;
      const cn = params.contingentName?.trim() || null;
      if (!name && !sn && !cn) return { items: [], total: 0 };

      const orClauses: Prisma.ManagerProfileWhereInput[] = [];
      if (name) {
        orClauses.push(
          { name:  { contains: name, mode: "insensitive" } },
          { email: { contains: name, mode: "insensitive" } },
        );
      }
      if (sn) {
        orClauses.push(
          { school: { name: { contains: sn, mode: "insensitive" } } },
          { higherInstitution: { name: { contains: sn, mode: "insensitive" } } },
          { contingentManagers: { some: { contingent: { school: { name: { contains: sn, mode: "insensitive" } } } } } },
        );
      }
      if (cn) {
        orClauses.push(
          { contingentManagers: { some: { contingent: { name: { contains: cn, mode: "insensitive" } }, status: "ACTIVE" } } },
        );
      }

      const where: Prisma.ManagerProfileWhereInput = { OR: orClauses };
      const [total, rows] = await Promise.all([
        db.managerProfile.count({ where }),
        db.managerProfile.findMany({
          where,
          include: {
            school:            { select: { id: true, name: true } },
            higherInstitution: { select: { id: true, name: true } },
            contingentManagers: {
              where: { status: "ACTIVE" },
              include: { contingent: { select: { id: true, name: true } } },
              take: 3,
            },
          },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "manager" })), total };
    }

    case "SEARCH_CONTINGENT": {
      const where: Prisma.ContingentWhereInput = {
        ...(name                   && { name: { contains: name, mode: "insensitive" } }),
        ...(params.hasParticipants && { participants: { some: {} } }),
        ...(params.contingentType  && { contingentType: params.contingentType as Prisma.EnumContingentTypeFilter }),
        ...(params.state           && { state: { name: { contains: params.state, mode: "insensitive" } } }),
      };
      const [total, rows] = await Promise.all([
        db.contingent.count({ where }),
        db.contingent.findMany({
          where,
          include: {
            school:            { select: { id: true, name: true } },
            higherInstitution: { select: { id: true, name: true } },
            _count: { select: { participants: true, teams: true, managers: true } },
          },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "contingent" })), total };
    }

    case "SEARCH_SCHOOL": {
      const q = params.schoolName?.trim() || name;
      const where: Prisma.SchoolWhereInput = {
        ...(q && { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
        ]}),
        ...(params.state && { state: { name: { contains: params.state, mode: "insensitive" } } }),
      };
      const [total, rows] = await Promise.all([
        db.school.count({ where }),
        db.school.findMany({
          where,
          include: { state: { select: { id: true, name: true } } },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "school" })), total };
    }

    case "SEARCH_TEAM": {
      if (!name && !params.competitionName && !params.contingentName) return { items: [], total: 0 };
      const where: Prisma.TeamWhereInput = {
        AND: [
          name                   ? { name:        { contains: name,                   mode: "insensitive" } } : {},
          params.competitionName ? { competition: { name: { contains: params.competitionName, mode: "insensitive" } } } : {},
          params.contingentName  ? { contingent:  { name: { contains: params.contingentName,  mode: "insensitive" } } } : {},
        ],
      };
      const [total, rows] = await Promise.all([
        db.team.count({ where }),
        db.team.findMany({
          where,
          include: {
            competition: { select: { id: true, name: true, code: true } },
            contingent:  { select: { id: true, name: true } },
            _count: { select: { members: true } },
          },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "team" })), total };
    }

    case "SEARCH_EVENT": {
      const where: Prisma.EventWhereInput = {
        ...(name          && { name:   { contains: name, mode: "insensitive" } }),
        ...(params.status && { status: params.status as Prisma.EnumEventStatusFilter }),
        ...(params.state  && { state:  { name: { contains: params.state, mode: "insensitive" } } }),
      };
      const [total, rows] = await Promise.all([
        db.event.count({ where }),
        db.event.findMany({
          where,
          include: {
            state: { select: { id: true, name: true } },
            zone:  { select: { id: true, name: true } },
            _count: { select: { eventCompetitions: true } },
          },
          skip, take,
          orderBy: { createdAt: "desc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "event" })), total };
    }

    case "SEARCH_COMPETITION": {
      const where: Prisma.CompetitionWhereInput = {
        ...(name && { name: { contains: name, mode: "insensitive" } }),
        ...(params.zone && {
          eventCompetitions: { some: { event: { zone: { name: { contains: params.zone, mode: "insensitive" } } } } },
        }),
        ...(params.state && {
          eventCompetitions: { some: { event: { state: { name: { contains: params.state, mode: "insensitive" } } } } },
        }),
      };
      const [total, rows] = await Promise.all([
        db.competition.count({ where }),
        db.competition.findMany({
          where,
          include: {
            _count: { select: { teams: true, eventCompetitions: true } },
          },
          skip, take,
          orderBy: { name: "asc" },
        }),
      ]);
      return { items: rows.map(e => ({ ...e, _type: "competition" })), total };
    }

    default:
      return { items: [], total: 0 };
  }
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { messages, provider = "gemini", subjects = [] } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: "MISSING_MESSAGES" }, { status: 400 });
  const subjectNames: string[] = (subjects as { name: string }[]).map(s => s.name);

  try {
    // KB retrieval — search before the AI call so context is baked in
    const lastUserText = messages.filter((m: Msg) => m.role === "user").at(-1)?.content ?? "";
    const kbArticles = await searchKb(lastUserText);
    const kbBlock    = buildKbBlock(kbArticles);
    const kbSources  = kbArticles.map(a => ({ title: a.title, path: a.path }));

    const { content, meta } = provider === "eptim"
      ? await callEptim(messages, kbBlock)
      : await callGemini(messages, kbBlock);

    let ai: AiResponse;
    try {
      const parsed = JSON.parse(extractJson(content));
      ai = { ...parsed, params: parsed.params ?? {} };
    } catch {
      ai = {
        intent: "GENERAL", action: "SEARCH", params: {},
        reply: content, needsClarification: false, clarificationQuestion: null,
      };
    }

    const result = await runQuery(ai.intent, ai.params, 1, 10);

    // COUNT result path
    if ((result as CountResult)._isCount) {
      const cr = result as CountResult;
      const userText = messages[messages.length - 1]?.content ?? "";
      const isMalay  = /berapa|ada |jumlah|bilangan|senarai|senarail/i.test(userText);
      const subjectClause = subjectNames.length > 0
        ? (isMalay ? ` dalam **${subjectNames.join("** dan **")}**` : ` in **${subjectNames.join("** and **")}**`)
        : "";
      const reply = isMalay
        ? `Terdapat **${cr.total}** ${cr.label} berdaftar${subjectClause}.`
        : `There are **${cr.total}** ${cr.label} registered${subjectClause}.`;
      return NextResponse.json({
        reply,
        intent: ai.intent,
        action: ai.action,
        entities: [],
        stats: { count: cr.total, label: cr.label, breakdown: cr.breakdown },
        needsClarification:    ai.needsClarification,
        clarificationQuestion: ai.clarificationQuestion,
        kbSources,
        provider,
        meta,
      });
    }

    // SEARCH result path
    const { items, total } = result as { items: unknown[]; total: number };
    const typeTag = ai.intent.replace("SEARCH_", "").toLowerCase();
    const entities = items.map((e: unknown) => {
      const rec = e as Record<string, unknown>;
      return {
        ...rec,
        _type:   (rec._type as string | undefined) ?? (typeTag === "ic" ? "participant" : typeTag),
        _action: ai.action,
      };
    });

    // Build queryParams for client-side pagination
    const p = ai.params;
    const queryParams: Record<string, string> = {};
    if (p.name)             queryParams.name            = p.name;
    if (p.ic)               queryParams.ic              = p.ic;
    if (p.contingentName)   queryParams.contingentName  = p.contingentName;
    if (p.schoolName)       queryParams.schoolName      = p.schoolName;
    if (p.competitionName)  queryParams.competitionName = p.competitionName;
    if (p.status)           queryParams.status          = p.status;
    if (p.gender)           queryParams.gender          = p.gender;
    if (p.contingentType)   queryParams.contingentType  = p.contingentType;
    if (p.state)            queryParams.state           = p.state;
    if (p.zone)             queryParams.zone            = p.zone;
    if (p.ppki  != null)    queryParams.ppki            = String(p.ppki);
    if (p.hasParticipants)  queryParams.hasParticipants = "true";

    return NextResponse.json({
      reply:               ai.reply,
      intent:              ai.intent,
      action:              ai.action,
      entities,
      total,
      page:                1,
      pageSize:            10,
      queryParams,
      needsClarification:  ai.needsClarification,
      clarificationQuestion: ai.clarificationQuestion,
      kbSources,
      provider,
      meta,
    });

  } catch (e) {
    console.error("smart-chat error:", e);
    return NextResponse.json({ error: "CHAT_FAILED", detail: String(e) }, { status: 500 });
  }
}

// ── GET handler — pagination ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const intent   = sp.get("intent") as Intent;
  const page     = Math.max(1, Number(sp.get("page") ?? "1"));
  const pageSize = Math.min(20, Math.max(1, Number(sp.get("pageSize") ?? "10")));

  if (!intent) return NextResponse.json({ error: "MISSING_INTENT" }, { status: 400 });

  const params: AiResponse["params"] = {
    name:            sp.get("name")            || null,
    ic:              sp.get("ic")              || null,
    contingentName:  sp.get("contingentName")  || null,
    schoolName:      sp.get("schoolName")      || null,
    competitionName: sp.get("competitionName") || null,
    status:          sp.get("status")          || null,
    gender:          sp.get("gender")          || null,
    contingentType:  sp.get("contingentType")  || null,
    state:           sp.get("state")           || null,
    zone:            sp.get("zone")            || null,
    ppki:            sp.get("ppki") === "true" ? true : sp.get("ppki") === "false" ? false : null,
    hasParticipants: sp.get("hasParticipants") === "true" ? true : null,
  };

  try {
    const result = await runQuery(intent, params, page, pageSize);
    if ((result as CountResult)._isCount)
      return NextResponse.json({ error: "INVALID_INTENT_FOR_LIST" }, { status: 400 });

    const { items, total } = result as { items: unknown[]; total: number };
    const typeTag = intent.replace("SEARCH_", "").toLowerCase();
    const entities = items.map((e: unknown) => {
      const rec = e as Record<string, unknown>;
      return {
        ...rec,
        _type:   (rec._type as string | undefined) ?? (typeTag === "ic" ? "participant" : typeTag),
        _action: "SEARCH",
      };
    });
    return NextResponse.json({ entities, total, page, pageSize });
  } catch (e) {
    return NextResponse.json({ error: "LIST_FAILED", detail: String(e) }, { status: 500 });
  }
}
