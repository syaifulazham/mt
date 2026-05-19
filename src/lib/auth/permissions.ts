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
    VIEWER: "read",
  },
  "/organizer/competitions": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
    VIEWER: "read",
  },
  "/organizer/participation": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
    PARTICIPANTS_MANAGER: "write",
    VIEWER: "read",
  },
  "/organizer/judging": {
    SUPER_ADMIN: "write",
    ADMIN: "write",
    OPERATOR: "write",
    JUDGE_COORDINATOR: "write",
    VIEWER: "read",
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

export function canAccess(
  role: OrganizerRole,
  pathname: string,
  method = "GET"
): boolean {
  const entry = Object.entries(PERMISSION_MAP).find(([prefix]) =>
    pathname.startsWith(prefix)
  );
  if (!entry) return true; // Unlisted paths allowed (auth middleware handles session check)

  const [, roleMap] = entry;
  const access = roleMap[role];
  if (!access) return false;
  if (access === "read" && method !== "GET") return false;
  return true;
}
