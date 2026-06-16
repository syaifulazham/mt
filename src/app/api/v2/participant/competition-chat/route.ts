import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/db";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { messages, competitionId, pdfUrl } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0 || !competitionId)
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  // Load competition details
  const comp = await db.competition.findUnique({
    where: { id: competitionId },
    include: {
      judgingCriteria: { select: { name: true, value: true } },
      targetGroups:    { include: { targetGroup: { select: { name: true, schoolLevel: true } } } },
      docs:            { select: { name: true, url: true } },
      theme:           { select: { name: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Attempt to fetch and encode the PDF for Gemini to read
  let pdfPart: { inlineData: { data: string; mimeType: string } } | null = null;
  if (pdfUrl) {
    try {
      const resp = await fetch(pdfUrl, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        const contentType = resp.headers.get("content-type") ?? "application/pdf";
        const buf  = await resp.arrayBuffer();
        const b64  = Buffer.from(buf).toString("base64");
        if (b64.length < 15_000_000) { // ~10 MB decoded limit
          pdfPart = { inlineData: { data: b64, mimeType: contentType.split(";")[0] || "application/pdf" } };
        }
      }
    } catch {
      // Proceed without PDF — answer from competition metadata only
    }
  }

  const compContext = `
Competition: ${comp.code} — ${comp.name}
Theme: ${comp.theme?.name ?? "—"}
Type: ${comp.participationType}
Venue: ${comp.venue ?? "TBA"}
Dates: ${comp.startDate?.toLocaleDateString("ms-MY") ?? "TBA"} – ${comp.endDate?.toLocaleDateString("ms-MY") ?? "TBA"}
Target groups: ${comp.targetGroups.map((t: { targetGroup: { name: string } }) => t.targetGroup.name).join(", ") || "—"}
Judging criteria: ${comp.judgingCriteria.map((c: { name: string; value: number }) => `${c.name} (${c.value}%)`).join(", ") || "—"}
Description: ${comp.description ?? "—"}
Documents: ${comp.docs.map((d: { name: string }) => d.name).join(", ") || "None"}
`.trim();

  const systemPrompt = `You are AI Rimau, the official smart assistant for Techlympics Malaysia. You are energetic, friendly, and passionate about empowering young Malaysian talent.

Right now the participant is viewing the competition detail page for:
${compContext}
${pdfPart ? "\nYou have been given the competition concept paper / document to read. Use its content to answer questions accurately." : ""}

Help the participant understand this competition — its rules, format, judging criteria, dates, and any details from the document. Use Bahasa Malaysia or English based on what the participant uses. Be concise and encouraging.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
  });

  // Build history. If a PDF was fetched, inject it as the first assistant context turn.
  const userMessages = messages as { role: string; content: string }[];
  const allButLast   = userMessages.slice(0, -1);
  const last         = userMessages[userMessages.length - 1];

  const baseHistory = allButLast
    .filter((_, i) => {
      const firstUser = allButLast.findIndex(m => m.role === "user");
      return i >= firstUser;
    })
    .map(m => ({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  // Prepend PDF context as the very first exchange in history
  const history = pdfPart && baseHistory.length === 0
    ? [] // will be in the sendMessage call below
    : baseHistory;

  const chat = model.startChat({ history });

  // For the first user message, include the PDF inline so Gemini reads it
  const parts: ({ text: string } | { inlineData: { data: string; mimeType: string } })[] =
    pdfPart && userMessages.length === 1
      ? [pdfPart, { text: last.content }]
      : [{ text: last.content }];

  const result = await chat.sendMessage(parts);
  const reply  = result.response.text();

  return NextResponse.json({ reply });
}
