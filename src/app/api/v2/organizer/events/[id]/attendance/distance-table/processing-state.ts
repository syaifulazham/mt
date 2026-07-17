// Shared in-memory signal — works because Next.js runs in a single Node.js process
// (self-hosted Docker). The stop route sets this; the background loop checks it.
export const stopRequested = new Set<string>();
