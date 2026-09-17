import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getOrganizerSession } from "@/lib/auth/session";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const MAX_SIZE = 20 * 1024 * 1024; // certificate base PDFs run 1–4 MB
const ALLOWED = {
  "application/pdf": { ext: "pdf", type: "PDF"   as const },
  "image/png":       { ext: "png", type: "IMAGE" as const },
  "image/jpeg":      { ext: "jpg", type: "IMAGE" as const },
};

const r2 = new S3Client({
  region:   "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * POST multipart { file } → { url, type }
 *
 * Content-addressed: the same artwork uploaded twice occupies one object, and a
 * published version's base asset can never be silently replaced underneath it —
 * a different file is a different key.
 */
export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "NO_FILE" }, { status: 400 });

  const kind = ALLOWED[file.type as keyof typeof ALLOWED];
  if (!kind) return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const key    = `cert-templates/${createHash("sha1").update(buffer).digest("hex")}.${kind.ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: buffer, ContentType: file.type,
  }));

  const publicUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  return NextResponse.json({ url: `${publicUrl}/${key}`, type: kind.type }, { status: 201 });
}
