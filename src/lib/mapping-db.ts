import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export type MCluster = {
  id: number;
  name_bm: string;
  name_en: string;
  sort_order: number;
};

export type MCompetition = {
  id: string;
  slug: string;
  name: string;
  cluster_id: number;
  is_international: number; // 0|1 (sqlite)
  method: string | null;
  desc_bm: string | null;
  desc_en: string | null;
  pdf_url: string | null;   // JSON string: [{name,url}] from master CompetitionDoc
  is_active: number;
  master_comp_id: string | null;
  sort_order: number;
};

export type MEntry = {
  id: string;
  competition_id: string;
  code: string;           // Competition.code from master DB (official code)
  level: string;          // kids|teens|youth|open|kindergarten
  tg_name: string | null; // TargetGroup.name from master
};

export type MCompetitionFull = MCompetition & { entries: MEntry[] };
export type MClusterFull = MCluster & { competitions: MCompetitionFull[] };

let _db: ReturnType<typeof Database> | null = null;

export function getMappingDb() {
  if (_db) return _db;

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  _db = new Database(path.join(dbDir, "mapping.db"));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS clusters (
      id         INTEGER PRIMARY KEY,
      name_bm    TEXT NOT NULL,
      name_en    TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id               TEXT PRIMARY KEY,
      slug             TEXT UNIQUE NOT NULL,
      name             TEXT NOT NULL,
      cluster_id       INTEGER NOT NULL REFERENCES clusters(id),
      is_international INTEGER NOT NULL DEFAULT 0,
      method           TEXT,
      desc_bm          TEXT,
      desc_en          TEXT,
      pdf_url          TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      master_comp_id   TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS entries (
      id             TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      code           TEXT NOT NULL,
      level          TEXT NOT NULL,
      tg_name        TEXT
    );
  `);

  // Migrations for older DBs that may not have these columns
  const safeMigrate = (sql: string) => { try { _db!.exec(sql); } catch { /* column exists */ } };
  safeMigrate("ALTER TABLE competitions ADD COLUMN pdf_url TEXT");
  safeMigrate("ALTER TABLE entries ADD COLUMN tg_name TEXT");

  // Migrate pdf_path → pdf_url if old schema exists
  const compCols = (_db.pragma("table_info(competitions)") as { name: string }[]).map(c => c.name);
  if (compCols.includes("pdf_path")) {
    safeMigrate("UPDATE competitions SET pdf_url = pdf_path WHERE pdf_url IS NULL AND pdf_path IS NOT NULL");
  }

  return _db;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[*():]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function schoolLevelToKey(schoolLevel: string): string {
  const k = schoolLevel.toUpperCase();
  if (k.includes("KINDERGARTEN") || k.includes("TADIKA") || k.includes("PRASEKOLAH")) return "kindergarten";
  if (k.includes("PRIMARY") || k.includes("RENDAH")) return "kids";
  if (k.includes("SECONDARY") || k.includes("MENENGAH")) return "teens";
  if (k.includes("YOUTH") || k.includes("BELIA")) return "youth";
  if (k.includes("HIGHER") || k.includes("UNIVERSITY") || k.includes("UNIVERSITI")) return "open";
  if (k.includes("TERBUKA") || k.includes("OPEN")) return "open";
  return "open";
}

// ── read ─────────────────────────────────────────────────────────────────────

export function getAllClusters(): MClusterFull[] {
  const db = getMappingDb();
  const clusters = db.prepare("SELECT * FROM clusters ORDER BY sort_order, id").all() as MCluster[];
  const comps = db.prepare("SELECT * FROM competitions ORDER BY sort_order, slug").all() as MCompetition[];
  const entries = db.prepare("SELECT * FROM entries ORDER BY code, level").all() as MEntry[];

  const entryMap = new Map<string, MEntry[]>();
  for (const e of entries) {
    const arr = entryMap.get(e.competition_id) ?? [];
    arr.push(e);
    entryMap.set(e.competition_id, arr);
  }

  const compMap = new Map<number, MCompetitionFull[]>();
  for (const c of comps) {
    const arr = compMap.get(c.cluster_id) ?? [];
    arr.push({ ...c, entries: entryMap.get(c.id) ?? [] });
    compMap.set(c.cluster_id, arr);
  }

  return clusters.map((cl) => ({ ...cl, competitions: compMap.get(cl.id) ?? [] }));
}

// ── write ─────────────────────────────────────────────────────────────────────

export function upsertCluster(cluster: Omit<MCluster, "sort_order"> & { sort_order?: number }) {
  const db = getMappingDb();
  db.prepare(`
    INSERT INTO clusters (id, name_bm, name_en, sort_order)
    VALUES (@id, @name_bm, @name_en, @sort_order)
    ON CONFLICT(id) DO UPDATE SET
      name_bm=excluded.name_bm, name_en=excluded.name_en, sort_order=excluded.sort_order
  `).run({ sort_order: 0, ...cluster });
}

/** Update only user-editable fields for an existing competition */
export function updateCompetitionUserFields(
  id: string,
  fields: {
    name?: string; slug?: string; cluster_id?: number;
    is_international?: number; method?: string | null;
    desc_bm?: string | null; desc_en?: string | null;
    is_active?: number; sort_order?: number;
  }
) {
  const db = getMappingDb();
  const sets: string[] = [];
  const vals: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k}=@${k}`); vals[k] = v;
  }
  if (sets.length) db.prepare(`UPDATE competitions SET ${sets.join(",")} WHERE id=@id`).run(vals);
}

/** Insert a new competition (user-created, no master link) */
export function insertCompetition(comp: Omit<MCompetition, "pdf_url" | "master_comp_id" | "sort_order"> & { pdf_url?: string | null; master_comp_id?: string | null; sort_order?: number }) {
  const db = getMappingDb();
  db.prepare(`
    INSERT INTO competitions (id, slug, name, cluster_id, is_international, method, desc_bm, desc_en, pdf_url, is_active, master_comp_id, sort_order)
    VALUES (@id, @slug, @name, @cluster_id, @is_international, @method, @desc_bm, @desc_en, @pdf_url, @is_active, @master_comp_id, @sort_order)
  `).run({ pdf_url: null, master_comp_id: null, sort_order: 0, ...comp });
}

export function deleteCompetition(id: string) {
  getMappingDb().prepare("DELETE FROM competitions WHERE id = ?").run(id);
}

// ── sync from master ──────────────────────────────────────────────────────────

export type MasterCompDoc = { name: string; url: string };

export type MasterTheme = {
  id: string;
  name: string;
  competitions: {
    id: string;       // master Competition.id
    code: string;     // master Competition.code (official entry code)
    name: string;
    pdfDocs: MasterCompDoc[];
    targetGroups: { targetGroup: { name: string; schoolLevel: string } }[];
  }[];
};

/**
 * Sync mapping data from master DB.
 *  - Groups same-name master competitions into one mapping competition
 *    (e.g. "Cabaran Robot" with codes 1.1K + 1.1R → 1 mapping comp, 2 entries).
 *  - Upserts clusters and competitions (matched by master_comp_id).
 *  - PRESERVES user-set: method, is_international, desc_bm, desc_en.
 *  - ALWAYS replaces entries with master target groups.
 *  - Sets pdf_url from master CompetitionDoc (JSON array).
 *
 * @param levelMap  "tgName|schoolLevel" → levelKey (AI-generated, optional)
 */
export function syncFromMaster(
  themes: MasterTheme[],
  levelMap: Record<string, string> = {}
) {
  const db = getMappingDb();

  const tx = db.transaction(() => {
    // Snapshot existing mapping competitions keyed by master_comp_id
    const existing = db.prepare(
      "SELECT id, master_comp_id FROM competitions WHERE master_comp_id IS NOT NULL"
    ).all() as { id: string; master_comp_id: string }[];
    const byMasterId = new Map(existing.map(r => [r.master_comp_id, r.id]));

    themes.forEach((theme, ti) => {
      const clusterId = ti + 1;

      // Upsert cluster — preserve user-set name_en
      const existingCluster = db.prepare("SELECT name_en FROM clusters WHERE id=?").get(clusterId) as { name_en: string } | undefined;
      if (existingCluster) {
        db.prepare("UPDATE clusters SET name_bm=?, sort_order=? WHERE id=?").run(theme.name, ti, clusterId);
      } else {
        db.prepare("INSERT INTO clusters (id, name_bm, name_en, sort_order) VALUES (?,?,'',?)").run(clusterId, theme.name, ti);
      }

      // Group master competitions by base slug (same name → one mapping competition)
      const groups = new Map<string, typeof theme.competitions>();
      for (const comp of theme.competitions) {
        const baseSlug = slugify(comp.name);
        const arr = groups.get(baseSlug) ?? [];
        arr.push(comp);
        groups.set(baseSlug, arr);
      }

      let ci = 0;
      for (const [baseSlug, comps] of groups) {
        const primary = comps[0];

        // Merge PDF docs from all variants, deduplicate by URL
        const allPdfDocs = comps.flatMap(c => c.pdfDocs);
        const uniquePdfDocs = Array.from(new Map(allPdfDocs.map(d => [d.url, d])).values());
        const pdfJson = uniquePdfDocs.length ? JSON.stringify(uniquePdfDocs) : null;

        // Find existing mapping competition matched by ANY of the group's master IDs
        let compId: string | undefined;
        for (const comp of comps) {
          const found = byMasterId.get(comp.id);
          if (found) { compId = found; break; }
        }

        if (compId) {
          db.prepare(
            "UPDATE competitions SET name=?, slug=?, cluster_id=?, pdf_url=?, sort_order=?, master_comp_id=? WHERE id=?"
          ).run(primary.name, baseSlug, clusterId, pdfJson, ci, primary.id, compId);
        } else {
          compId = randomUUID();
          db.prepare(`
            INSERT INTO competitions
              (id, slug, name, cluster_id, is_international, method, desc_bm, desc_en, pdf_url, is_active, master_comp_id, sort_order)
            VALUES (?,?,?,?,0,null,null,null,?,1,?,?)
          `).run(compId, baseSlug, primary.name, clusterId, pdfJson, primary.id, ci);
        }

        // Re-sync entries: one entry per (master comp code × target group), preserving each code
        db.prepare("DELETE FROM entries WHERE competition_id=?").run(compId);
        const seen = new Set<string>();
        for (const comp of comps) {
          for (const { targetGroup: tg } of comp.targetGroups) {
            const mapKey = `${tg.name}|${tg.schoolLevel}`;
            const levelKey = levelMap[mapKey] ?? schoolLevelToKey(tg.schoolLevel);
            // Dedup by code+level+tgName to avoid true duplicates
            const dedupKey = `${comp.code}|${levelKey}|${tg.name}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);
            db.prepare(
              "INSERT INTO entries (id, competition_id, code, level, tg_name) VALUES (?,?,?,?,?)"
            ).run(randomUUID(), compId, comp.code, levelKey, tg.name);
          }
        }

        ci++;
      }
    });
  });

  tx();
}
