import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizerSession } from "@/lib/auth/session";
import { LANDING_WRITE_ROLES } from "@/lib/landingSections";
import { generateSection } from "@/lib/landingSectionsAi";

export const maxDuration = 60;

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  language: z.enum(["ms", "en"]).default("ms"),
  useGallery: z.boolean().default(true),
  /** When set, the AI revises this section instead of starting fresh. */
  current: z.object({ title: z.string().max(200), blocks: z.array(z.unknown()).max(60) }).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!LANDING_WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI is not configured (GEMINI_API_KEY)" }, { status: 503 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe the section you want (at least a few words)." }, { status: 400 });

  try {
    return NextResponse.json({ data: await generateSection({ apiKey, ...parsed.data }) });
  } catch (e) {
    console.error("[landing sections ai-generate]", e);
    return NextResponse.json({ error: "The AI helper could not generate a section. Try again or rephrase." }, { status: 502 });
  }
}
