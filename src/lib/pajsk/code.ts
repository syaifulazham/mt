/**
 * PAJSK verification codes: 10 characters of Crockford base32 (no I, L, O, U),
 * 50 random bits — printed as XXXXX-XXXXX. Not derived from any personal data.
 */
import { randomBytes } from "crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 10;

export function newPajskCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

/** User input → canonical code, or null. Accepts dashes/spaces, lower case and the usual look-alikes. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** "AHMAD BIN ALI" → "A**** B** A**": enough to recognise, not enough to identify. */
export function maskName(name: string): string {
  return name.trim().split(/\s+/).map(w => {
    const chars = [...w];
    return chars[0] + "*".repeat(Math.max(chars.length - 1, 1));
  }).join(" ");
}
