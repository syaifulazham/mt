import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getOrganizerSession } from "@/lib/auth/session";
import { backupDb, BACKUP_DIR } from "@/lib/backup-db";

function parseDatabaseUrl(url: string) {
  const u = new URL(url);
  return {
    host:     u.hostname,
    port:     u.port || "5432",
    user:     decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    dbname:   u.pathname.replace(/^\//, "").split("?")[0],
  };
}

function nowIso() {
  return new Date().toISOString();
}

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const records = backupDb.list().map((r) => ({
    ...r,
    // omit internal filepath from response
    filepath: undefined,
  }));
  return NextResponse.json({ data: records });
}

export async function POST() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 500 });

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 15); // YYYYMMDDHHmmss
  const id       = randomUUID();
  const filename = `backup_${stamp}.dump`;
  const filepath = path.join(BACKUP_DIR, filename);

  backupDb.insert({ id, filename, filepath, status: "running", created_at: nowIso() });

  // Run pg_dump asynchronously — do not await
  (async () => {
    try {
      const pg = parseDatabaseUrl(databaseUrl);
      const env = {
        ...process.env,
        PGPASSWORD: pg.password,
      };

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          "pg_dump",
          ["-h", pg.host, "-p", pg.port, "-U", pg.user, "-d", pg.dbname, "-F", "c", "-f", filepath],
          { env },
        );

        let stderr = "";
        proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `pg_dump exited with code ${code}`));
        });
        proc.on("error", (err) => reject(err));
      });

      const size = fs.existsSync(filepath) ? fs.statSync(filepath).size : null;
      backupDb.update(id, { status: "completed", completed_at: nowIso(), size });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      backupDb.update(id, { status: "failed", completed_at: nowIso(), error: msg });
      // Remove partial dump file if it exists
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
  })();

  return NextResponse.json({ data: backupDb.get(id) }, { status: 202 });
}
