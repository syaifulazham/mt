import { NextResponse } from "next/server";
import { getAllClusters } from "@/lib/mapping-db";

export async function GET() {
  try {
    const clusters = getAllClusters();
    return NextResponse.json({ clusters });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load mapping" }, { status: 500 });
  }
}
