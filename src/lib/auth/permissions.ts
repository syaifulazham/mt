import type { OrganizerRole } from "@/types";

// Defines which roles can access each route prefix.
// "write" = GET + mutating methods; "read" = GET only; false = blocked.
const PERMISSION_MAP: Record<string, Partial<Record<OrganizerRole, "write" | "read" | false>>> = {
  "/organizer/users": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
  },
  "/organizer/reference-data": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "read",
  },
  "/organizer/events": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
  },
  "/organizer/competitions": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
  },
  "/organizer/participation": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
    PARTICIPANTS_MANAGER: "write",
  },
  "/organizer/judging": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
    JUDGE_COORDINATOR: "write",
  },
  "/organizer/system": {
    SUPER_ADMIN: "write",
  },
  // Dashboard is accessible to all roles
  "/organizer/dashboard": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
    PARTICIPANTS_MANAGER: "write",
    JUDGE_COORDINATOR: "write",
    VIEWER: "read",
  },
};

// Paths a VIEWER may visit in addition to dashboard (utility/auth pages)
const VIEWER_ALLOWED: string[] = [
  "/organizer/dashboard",
  "/organizer/profile",
  "/organizer/totp",
  "/organizer/change-password",
];

export function canAccess(
  role: OrganizerRole,
  pathname: string,
  method = "GET"
): boolean {
  // VIEWER is restricted to dashboard and essential account pages only
  if (role === "VIEWER") {
    return VIEWER_ALLOWED.some((p) => pathname.startsWith(p));
  }

  const entry = Object.entries(PERMISSION_MAP).find(([prefix]) =>
    pathname.startsWith(prefix)
  );
  if (!entry) return true; // Unlisted paths allowed for non-VIEWER roles

  const [, roleMap] = entry;
  const access = roleMap[role];
  if (!access) return false;
  if (access === "read" && method !== "GET") return false;
  return true;
}
