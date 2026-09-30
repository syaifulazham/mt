/**
 * Email handling for participant profiles.
 *
 * Addresses reach us from phone keyboards, spreadsheets and AI-parsed CSVs, so
 * they arrive with fullwidth punctuation (`＠` U+FF20, `．` U+FF0E), stray
 * spaces, and sometimes a phone number or a placeholder instead of an address.
 * A single bad value used to lock a participant out of Asia Spark Quizzly
 * entirely, because Quizzly validates `email` and rejects the whole
 * registration — see src/lib/asiaspark-quizzly.ts.
 *
 * Two separate jobs, deliberately kept apart:
 *   - `foldEmail` tidies without ever discarding, so it is safe at a write
 *     boundary where the participant's own data must be preserved;
 *   - `isValidEmail` decides whether the result is worth handing to a third
 *     party, which is a judgement no write path should silently apply.
 */

/**
 * Lossless tidy-up of an address as typed: NFKC folds fullwidth characters to
 * ASCII (`＠` → `@`) and the ends are trimmed. Empty becomes null. Nothing
 * else is changed, so the stored value still reflects what was entered.
 */
export function foldEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const folded = raw.normalize("NFKC").trim();
  return folded === "" ? null : folded;
}

/**
 * Whether an address is plausible enough for a third party to accept.
 *
 * Internal whitespace fails rather than being stripped: which space was the
 * accident is a guess, and collapsing them all turns a pasted form row
 * ("NAME  120401070533  a@b.com  011 37474011") into a valid-looking address.
 * Lengths follow RFC 5321 — 254 total, 64 for the local part.
 */
export function isValidEmail(email: string): boolean {
  if (/\s/.test(email) || email.length > 254) return false;
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(email);
  return !!m && m[1].length <= 64;
}

/** `foldEmail` plus the validity gate — null when the value cannot be used. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const folded = foldEmail(raw);
  return folded && isValidEmail(folded) ? folded : null;
}
