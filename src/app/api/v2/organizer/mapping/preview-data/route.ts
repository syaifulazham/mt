import { NextResponse } from "next/server";
import { getAllClusters } from "@/lib/mapping-db";

export async function GET() {
  try {
    const clusters = getAllClusters();

    // Shape into the COMPS + cluster structure the D3 preview page expects
    const clusterMeta = clusters.map((cl) => ({
      id: cl.id,
      name_bm: cl.name_bm,
      name_en: cl.name_en || cl.name_bm,
    }));

    const comps = clusters.flatMap((cl) =>
      cl.competitions.map((c) => ({
        id: c.slug,
        name: c.name,
        cl: cl.id,
        int: c.is_international === 1,
        method: c.method ?? undefined,
        desc_bm: c.desc_bm ?? "",
        desc_en: c.desc_en ?? "",
        entries: c.entries.map((e) => [e.code, e.level] as [string, string]),
      }))
    );

    return NextResponse.json({ clusters: clusterMeta, comps });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load preview data" }, { status: 500 });
  }
}
