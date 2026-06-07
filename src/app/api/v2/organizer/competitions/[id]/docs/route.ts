import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;

  const docs = await db.competitionDoc.findMany({
    where: { competitionId: id },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json(docs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;

  const competition = await db.competition.findUnique({ where: { id }, select: { id: true } });
  if (!competition) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const bucket    = process.env.R2_BUCKET_NAME!;
  const publicUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");

  const saved = await Promise.all(
    files.map(async (file) => {
      const key = `docs/${randomUUID()}.pdf`;
      const buf = Buffer.from(await file.arrayBuffer());

      await r2.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         key,
        Body:        buf,
        ContentType: "application/pdf",
        ContentDisposition: `inline; filename="${file.name}"`,
      }));

      const url = `${publicUrl}/${key}`;
      return db.competitionDoc.create({
        data: { competitionId: id, name: file.name, url, key, size: file.size },
      });
    }),
  );

  return NextResponse.json(saved, { status: 201 });
}
