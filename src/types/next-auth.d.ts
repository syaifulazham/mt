import type { OrganizerRole } from "@/types";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: OrganizerRole;
      totpPending?: boolean;
      forcePasswordChange?: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: OrganizerRole;
    totpPending?: boolean;
    forcePasswordChange?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: OrganizerRole;
    totpPending?: boolean;
    forcePasswordChange?: boolean;
  }
}
