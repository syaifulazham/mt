import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { getOrganizerSession } from "@/lib/auth/session";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const bucket    = process.env.R2_BUCKET_NAME!;
  const publicUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

  const results = await Promise.all(
    files.map(async (file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const key = `news/${randomUUID()}.${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());

      await r2.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         key,
        Body:        buf,
        ContentType: file.type || "image/jpeg",
      }));

      return { key, url: `${publicUrl}/${key}`, name: file.name };
    }),
  );

  return NextResponse.json({ files: results });
}
