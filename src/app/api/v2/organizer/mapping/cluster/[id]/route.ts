import { NextRequest, NextResponse } from "next/server";
import { upsertCluster } from "@/lib/mapping-db";
import { getOrganizerSession } from "@/lib/auth/session";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name_bm, name_en, sort_order } = body;

  try {
    upsertCluster({ id: Number(id), name_bm, name_en: name_en ?? "", sort_order: sort_order ?? 0 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update cluster" }, { status: 500 });
  }
}
