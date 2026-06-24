import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, truncateSync } from "fs";
import { dirname, join } from "path";

export type LogLevel = "error" | "warn" | "info";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — truncate oldest when exceeded

export function logFilePath(): string {
  // In production Docker the data volume is mounted at /app/data
  if (process.env.NODE_ENV === "production") return "/app/data/app-errors.log";
  // In development write to .logs/ in project root
  return join(process.cwd(), ".logs", "app-errors.log");
}

function write(entry: LogEntry) {
  if (typeof window !== "undefined") return; // never run on client
  try {
    const path = logFilePath();
    const dir  = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Rotate by truncating the first half when we exceed the size cap
    if (existsSync(path) && statSync(path).size > MAX_BYTES) {
      const content = readFileSync(path, "utf8");
      const lines   = content.split("\n").filter(Boolean);
      const kept    = lines.slice(Math.floor(lines.length / 2));
      truncateSync(path, 0);
      appendFileSync(path, kept.join("\n") + "\n");
    }

    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
    // swallow — logging must never crash the app
  }
}

export function logError(source: string, error: unknown, detail?: string) {
  write({
    ts:      new Date().toISOString(),
    level:   "error",
    source,
    message: error instanceof Error ? error.message : String(error),
    detail:  detail ?? (error instanceof Error ? error.stack?.split("\n")[1]?.trim() : undefined),
  });
}

export function logWarn(source: string, message: string, detail?: string) {
  write({ ts: new Date().toISOString(), level: "warn", source, message, detail });
}

export function logInfo(source: string, message: string, detail?: string) {
  write({ ts: new Date().toISOString(), level: "info", source, message, detail });
}

/** Read the last `limit` log entries from the log file (newest first). */
export function readLogs(limit = 200, level?: LogLevel): LogEntry[] {
  try {
    const path = logFilePath();
    if (!existsSync(path)) return [];
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
    const parsed: LogEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < limit * 2; i--) {
      try {
        const e = JSON.parse(lines[i]) as LogEntry;
        if (!level || e.level === level) parsed.push(e);
      } catch { /* skip malformed lines */ }
    }
    return parsed.slice(0, limit);
  } catch {
    return [];
  }
}
