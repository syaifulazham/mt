import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getOrganizerSession } from "@/lib/auth/session";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const MAX_SIZE    = 2 * 1024 * 1024;
const ALLOWED     = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const state = await db.state.findUnique({ where: { id } });
  if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file)                        return NextResponse.json({ error: "NO_FILE" },       { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "INVALID_TYPE" },  { status: 400 });
  if (file.size > MAX_SIZE)         return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

  const ext        = (file.name.split(".").pop()?.toLowerCase()) ?? "png";
  const key        = `states/${randomUUID()}.${ext}`;
  const buf        = Buffer.from(await file.arrayBuffer());
  const publicUrl  = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

  await r2.send(new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET_NAME!,
    Key:         key,
    Body:        buf,
    ContentType: file.type,
  }));

  const flagUrl = `${publicUrl}/${key}`;
  await db.state.update({ where: { id }, data: { flagUrl } });

  return NextResponse.json({ url: flagUrl }, { status: 201 });
}
