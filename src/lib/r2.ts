import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 (S3 API). Objects are served from NEXT_PUBLIC_R2_PUBLIC_URL.

let client: S3Client | null = null;
function r2() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

export function r2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

export function r2PublicUrl(key: string) {
  return `${(process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}`;
}

/** The object key of a public R2 URL, or null when it is not one. */
export function r2KeyOf(url: string) {
  const base = `${(process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/`;
  return base.length > 1 && url.startsWith(base) ? url.slice(base.length) : null;
}

export async function r2Put(key: string, body: Buffer, contentType: string) {
  await r2().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: body, ContentType: contentType }));
  return r2PublicUrl(key);
}

/** Best effort: a failed delete only leaves an orphan object. */
export async function r2Delete(key: string) {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
  } catch (e) {
    console.error("[r2] delete failed:", key, e);
  }
}
