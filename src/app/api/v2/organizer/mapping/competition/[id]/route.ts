import { NextRequest, NextResponse } from "next/server";
import { updateCompetitionUserFields, deleteCompetition, getAllClusters, slugify } from "@/lib/mapping-db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const {
    name, slug, cluster_id, is_international, method,
    desc_bm, desc_en, is_active, sort_order,
  } = body;

  // Only update user-editable fields; pdf_url and entries are master-managed
  try {
    updateCompetitionUserFields(id, {
      name,
      slug: (slug || slugify(name)).trim(),
      cluster_id: cluster_id !== undefined ? Number(cluster_id) : undefined,
      is_international: is_international !== undefined ? (is_international ? 1 : 0) : undefined,
      method: method !== undefined ? (method || null) : undefined,
      desc_bm: desc_bm !== undefined ? (desc_bm || null) : undefined,
      desc_en: desc_en !== undefined ? (desc_en || null) : undefined,
      is_active: is_active !== undefined ? (is_active !== false ? 1 : 0) : undefined,
      sort_order: sort_order ?? undefined,
    });

    const clusters = getAllClusters();
    return NextResponse.json({ ok: true, clusters });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update competition" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    deleteCompetition(id);
    const clusters = getAllClusters();
    return NextResponse.json({ ok: true, clusters });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete competition" }, { status: 500 });
  }
}
