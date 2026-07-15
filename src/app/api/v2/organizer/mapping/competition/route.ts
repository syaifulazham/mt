import { NextRequest, NextResponse } from "next/server";
import { insertCompetition, getAllClusters, slugify } from "@/lib/mapping-db";
import { randomUUID } from "crypto";
import { getOrganizerSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const {
    name, slug, cluster_id, is_international, method,
    desc_bm, desc_en, is_active, master_comp_id, sort_order,
  } = body;

  if (!name || !cluster_id) {
    return NextResponse.json({ error: "name and cluster_id are required" }, { status: 400 });
  }

  try {
    const id = randomUUID();
    const finalSlug = (slug || slugify(name)).trim();

    insertCompetition({
      id,
      slug: finalSlug,
      name,
      cluster_id: Number(cluster_id),
      is_international: is_international ? 1 : 0,
      method: method || null,
      desc_bm: desc_bm || null,
      desc_en: desc_en || null,
      is_active: is_active !== false ? 1 : 0,
      master_comp_id: master_comp_id || null,
      sort_order: sort_order ?? 0,
    });

    const clusters = getAllClusters();
    return NextResponse.json({ id, clusters });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create competition" }, { status: 500 });
  }
}
