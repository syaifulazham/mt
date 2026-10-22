// Confirmation code for irreversible actions: random characters without
// look-alikes (0/O, 1/I/L) so what is read can't be mistyped. Typed back by the
// user before the action button unlocks (judging completion, CSI attempt reset).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function confirmationCode(len = 5) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}
