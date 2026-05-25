import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/db";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: "MESSAGES_REQUIRED" }, { status: 400 });

  // Load participant context
  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    include: {
      contingent: { select: { name: true } },
      teamMembers: {
        include: {
          team: {
            include: {
              competition: { select: { name: true, code: true, venue: true, startDate: true, endDate: true } },
              trainers: { include: { trainer: { select: { name: true, phoneNumber: true } } } },
            },
          },
        },
      },
    },
  });

  const context = participant ? `
Participant: ${participant.name}
Contingent: ${participant.contingent.name}
Education: ${participant.eduLevel} ${participant.classGrade ?? ""} ${participant.className ?? ""}
Teams: ${participant.teamMembers.map(m =>
  `${m.team.name} (${m.team.competition.name}, venue: ${m.team.competition.venue ?? "TBA"}, date: ${m.team.competition.startDate?.toLocaleDateString("ms-MY") ?? "TBA"})`
).join("; ") || "Not in any team yet"}
Trainers: ${participant.teamMembers.flatMap(m => m.team.trainers.map(t => `${t.trainer.name} (${t.trainer.phoneNumber ?? "no phone"})`)).join("; ") || "None assigned"}
` : "";

  const systemPrompt = `You are a helpful assistant for Techlympics Malaysia participants. You help participants understand their competition schedule, team details, rules, and anything about Techlympics.

Be friendly, encouraging, and concise. Use Bahasa Malaysia or English based on what the participant uses. Keep responses short and clear.

Participant context:
${context}`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
  });

  const allButLast = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  // Gemini requires history to start with a user turn
  const firstUser = allButLast.findIndex((m) => m.role === "user");
  const history = firstUser === -1 ? [] : allButLast.slice(firstUser);

  const chat = model.startChat({ history });
  const last = messages[messages.length - 1];
  const result = await chat.sendMessage(last.content);
  const text   = result.response.text();

  return NextResponse.json({ reply: text });
}
