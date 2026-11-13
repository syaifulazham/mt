import { NextRequest, NextResponse } from "next/server";
import { authInternationalLink, findInternationalLink } from "@/lib/international-link";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

// GET — what the passcode screen shows (no passcode needed).
export async function GET(_req: NextRequest, { params }: Params) {
  const link = await findInternationalLink((await params).slug);
  if (!link) return NextResponse.json({ error: "NOT_FOUND", message: "Pautan tidak wujud atau telah ditutup." }, { status: 404 });
  return NextResponse.json({ label: link.label, eventName: link.event.name });
}

// POST { passcode } — verify the passcode; returns the event the link registers for.
export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json().catch(() => ({})) as { passcode?: string };
  const a = await authInternationalLink(req, (await params).slug, String(body.passcode ?? ""));
  if ("res" in a) return a.res;
  return NextResponse.json({ ok: true, label: a.link.label, scope: a.who.scope, event: a.link.event });
}
