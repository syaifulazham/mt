import { auth } from "@/lib/auth/auth";
import type { OrganizerRole } from "@/types";

export async function getOrganizerSession() {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as {
    id: string;
    email: string;
    name: string;
    role: OrganizerRole;
    totpPending?: boolean;
    forcePasswordChange?: boolean;
  };
}

export async function requireOrganizerRole(...roles: OrganizerRole[]) {
  const user = await getOrganizerSession();
  if (!user) return null;
  if (!roles.includes(user.role)) return null;
  return user;
}
