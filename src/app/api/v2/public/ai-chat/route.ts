import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const EPTIM_URL     = process.env.EPTIM_URL     ?? "https://eptim-core.bytesforge.net";
const EPTIM_API_KEY = process.env.EPTIM_API_KEY ?? "";

const SYSTEM_PROMPT = `You are AiRimau, the friendly AI mascot and assistant for Malaysia Techlympics 2026 — Malaysia's premier national technology olympiad for students.

Your role is to help visitors understand the competition: what it is, how to register, competition categories, participation requirements, dates, venues, and any other information from the knowledge base.

PERSONALITY:
- Friendly, enthusiastic, encouraging
- Speak like a helpful guide, not a formal document
- Use the mascot tiger persona warmly — you are AiRimau!
- Keep replies concise (2–4 paragraphs max)

KNOWLEDGE CONTEXT:
The following information comes from the official Techlympics knowledge base. Use it as your primary source of truth:

{KB_CONTEXT}

RULES:
1. Answer based on the knowledge base content above. If the answer is not in the knowledge base, say so honestly and suggest visiting techlympics.my or contacting the organizers.
2. LANGUAGE: Reply ONLY in one of two languages — Bahasa Malaysia (BM) or British English (UK spelling, e.g. "colour", "organised", "programme"). Detect the user's language from their message and reply in the same language. Never use American English spelling.
3. Do not make up competition details, dates, or venues not mentioned in the knowledge base.
4. Be encouraging — Techlympics is open to all school students and is FREE to join!
5. For registration questions, direct users to the "Daftar" / "Register" button on this page.`;

type EptimMessage = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json() as {
      message: string;
      history: EptimMessage[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "EMPTY_MESSAGE" }, { status: 400 });
    }

    // Search KB for relevant content
    const terms = message.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    const kbItems = await db.knowledgeBase.findMany({
      where: terms.length > 0 ? {
        OR: terms.flatMap((term) => [
          { title:   { contains: term, mode: "insensitive" as const } },
          { content: { contains: term, mode: "insensitive" as const } },
        ]),
      } : {},
      select: { title: true, content: true },
      take: 6,
      orderBy: { updatedAt: "desc" },
    });

    // Fallback: grab most recent KB articles for general context
    const contextItems = kbItems.length > 0 ? kbItems : await db.knowledgeBase.findMany({
      select: { title: true, content: true },
      take: 4,
      orderBy: { updatedAt: "desc" },
    });

    const kbContext = contextItems.length > 0
      ? contextItems.map((item) => `### ${item.title}\n${item.content}`).join("\n\n---\n\n")
      : "No specific knowledge base content available. Provide general Techlympics information.";

    // Build messages for eptim consensus
    const messages: EptimMessage[] = [
      { role: "system", content: SYSTEM_PROMPT.replace("{KB_CONTEXT}", kbContext) },
      ...history.slice(-10), // keep last 10 turns
      { role: "user", content: message },
    ];

    const res = await fetch(`${EPTIM_URL}/v1/consensus/single`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": EPTIM_API_KEY,
      },
      body: JSON.stringify({
        messages,
        model: "claude",
        options: { timeout_ms: 30000 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-chat] eptim error", res.status, err);
      return NextResponse.json({ error: "CHAT_FAILED" }, { status: 500 });
    }

    const data = await res.json() as { content: string };
    return NextResponse.json({ reply: data.content });

  } catch (e) {
    console.error("[public/ai-chat]", e);
    return NextResponse.json({ error: "CHAT_FAILED" }, { status: 500 });
  }
}
