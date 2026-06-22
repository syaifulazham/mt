import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const BACKUP_DIR =
  process.env.BACKUP_DIR ?? path.join(process.cwd(), "data", "backups");

const DB_PATH =
  process.env.BACKUP_META_DB ?? path.join(process.cwd(), "data", "backups.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS backups (
        id           TEXT PRIMARY KEY,
        filename     TEXT NOT NULL,
        filepath     TEXT NOT NULL,
        size         INTEGER,
        status       TEXT NOT NULL DEFAULT 'running',
        created_at   TEXT NOT NULL,
        completed_at TEXT,
        note         TEXT,
        error        TEXT
      )
    `);
  }
  return _db;
}

export type BackupRecord = {
  id: string;
  filename: string;
  filepath: string;
  size: number | null;
  status: "running" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
  note: string | null;
  error: string | null;
};

export const backupDb = {
  list(): BackupRecord[] {
    return getDb()
      .prepare("SELECT * FROM backups ORDER BY created_at DESC")
      .all() as BackupRecord[];
  },

  get(id: string): BackupRecord | null {
    return (
      (getDb()
        .prepare("SELECT * FROM backups WHERE id = ?")
        .get(id) as BackupRecord) ?? null
    );
  },

  insert(r: Omit<BackupRecord, "size" | "completed_at" | "note" | "error"> & Partial<Pick<BackupRecord, "size" | "completed_at" | "note" | "error">>): void {
    getDb()
      .prepare(`
        INSERT INTO backups (id, filename, filepath, size, status, created_at, completed_at, note, error)
        VALUES (@id, @filename, @filepath, @size, @status, @created_at, @completed_at, @note, @error)
      `)
      .run({ size: null, completed_at: null, note: null, error: null, ...r });
  },

  update(id: string, fields: Partial<Omit<BackupRecord, "id">>): void {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = @${k}`).join(", ");
    getDb()
      .prepare(`UPDATE backups SET ${sets} WHERE id = @id`)
      .run({ id, ...fields });
  },

  delete(id: string): void {
    getDb().prepare("DELETE FROM backups WHERE id = ?").run(id);
  },
};
