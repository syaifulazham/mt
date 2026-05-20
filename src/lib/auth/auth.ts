import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import * as argon2 from "argon2";
import { db } from "@/lib/db";
import type { OrganizerRole } from "@/types";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8-hour JWT
  pages: {
    signIn: "/organizer/login",
    error: "/organizer/login",
  },
  providers: [
    Credentials({
      id: "organizer-credentials",
      name: "Organizer",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.organizerUser.findUnique({
          where: { email: credentials.email as string, deletedAt: null, isActive: true },
        });
        if (!user) return null;

        const valid = await argon2.verify(user.passwordHash, credentials.password as string);
        if (!valid) return null;

        await db.organizerUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as OrganizerRole,
          totpPending: user.totpEnabled,
          forcePasswordChange: user.forcePasswordChange,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as OrganizerRole;
        token.totpPending = user.totpPending;
        token.forcePasswordChange = user.forcePasswordChange;
      }
      // update() call from the client — patch specific token fields
      if (trigger === "update" && session) {
        if (session.forcePasswordChange !== undefined) token.forcePasswordChange = session.forcePasswordChange;
        if (session.totpPending !== undefined) token.totpPending = session.totpPending;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.totpPending = token.totpPending;
      session.user.forcePasswordChange = token.forcePasswordChange;
      return session;
    },
  },
});
