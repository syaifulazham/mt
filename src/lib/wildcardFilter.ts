/**
 * Case-insensitive matcher for list filters. Without * or ? it is a substring
 * match; with them, a wildcard pattern over the whole value (* = any run of
 * characters, ? = exactly one), e.g. "3.*", "*Dron*", "?.1R". Empty matches all.
 */
export function wildcardMatcher(raw: string): (value: string) => boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return () => true;
  if (!/[*?]/.test(q)) return (v) => v.toLowerCase().includes(q);
  const re = new RegExp(
    "^" + q.split("").map((ch) => ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("") + "$",
  );
  return (v) => re.test(v.toLowerCase());
}
