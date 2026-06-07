import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const folderId = req.nextUrl.searchParams.get("folderId");
  if (!folderId) return NextResponse.json({ error: "MISSING_FOLDER_ID" }, { status: 400 });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 });

  const q     = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed = false`);
  const fields = encodeURIComponent("files(id,name,thumbnailLink,webContentLink,imageMediaMetadata)");
  const url   = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    return NextResponse.json({ error: err.error?.message ?? "Drive API error" }, { status: res.status });
  }

  const data = await res.json();
  const files = (data.files ?? []).map((f: { id: string; name: string; thumbnailLink?: string }) => ({
    id:       f.id,
    name:     f.name,
    thumbUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`,
    fullUrl:  `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`,
  }));

  return NextResponse.json({ files });
}
