import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { canAccess } from "@/lib/auth/permissions";

const handleI18nRouting = createIntlMiddleware(routing);

const isOrganizerRoute = createRouteMatcher(["/organizer(.*)", "/api/v2/auth/organizer(.*)"]);
// Manager routes — no locale prefix with localePrefix: "never"
const isManagerRoute = createRouteMatcher(["/manager(.*)", "/api/v2/manager(.*)"]);
const isPublicOrganizerRoute = createRouteMatcher([
  "/organizer/login",
  "/organizer/invite/(.*)",
]);
const isPublicManagerRoute = createRouteMatcher([
  "/manager/sign-in(.*)",
  "/manager/sign-up(.*)",
]);
const isWebhookRoute = createRouteMatcher(["/api/v2/webhooks(.*)"]);
const isJudgingRoute = createRouteMatcher(["/judging(.*)"]);
// Auth.js uses /api/auth/* internally — must be fully public
const isAuthJsInternalRoute = createRouteMatcher(["/api/auth(.*)"]);

// Build a safe base URL for redirects — uses the public origin from
// X-Forwarded-Host/Proto headers (set by nginx) so internal port never leaks.
function publicOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host  = req.headers.get("x-forwarded-host")  ?? req.headers.get("host") ?? req.nextUrl.host;
  // Strip any port from the host — the public URL is always on standard 80/443
  const cleanHost = host.replace(/:\d+$/, "");
  return `${proto}://${cleanHost}`;
}

export default clerkMiddleware(async (clerkAuth, req: NextRequest) => {
  const { pathname } = req.nextUrl;

  // Auth.js internal routes (CSRF, session, providers, callbacks) — never intercept
  if (isAuthJsInternalRoute(req)) return NextResponse.next();

  // Webhooks — no auth, signature verified in route handler
  if (isWebhookRoute(req)) return NextResponse.next();

  // ── Organizer routes (Auth.js v5 JWT) ───────────────────────────────────
  if (isOrganizerRoute(req)) {
    if (isPublicOrganizerRoute(req)) return NextResponse.next();

    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET!,
      cookieName:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
    });

    if (!token) {
      const loginUrl = new URL("/organizer/login", publicOrigin(req));
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (token.totpPending && pathname !== "/organizer/totp") {
      return NextResponse.redirect(new URL("/organizer/totp", publicOrigin(req)));
    }

    if (token.forcePasswordChange && pathname !== "/organizer/change-password") {
      return NextResponse.redirect(new URL("/organizer/change-password", publicOrigin(req)));
    }

    const allowed = canAccess(token.role, pathname, req.method);
    if (!allowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/organizer/dashboard", publicOrigin(req)));
    }

    return NextResponse.next();
  }

  // ── Manager routes (Clerk) ──────────────────────────────────────────────
  if (isManagerRoute(req)) {
    // API routes never need locale rewriting
    if (pathname.startsWith("/api/")) {
      if (isPublicManagerRoute(req)) return NextResponse.next();
      const { userId } = await clerkAuth();
      if (!userId) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
          { status: 401 },
        );
      }
      return NextResponse.next();
    }

    // Public pages: still need the i18n rewrite so [locale] segment resolves
    if (isPublicManagerRoute(req)) return handleI18nRouting(req);

    const { userId } = await clerkAuth();
    if (!userId) {
      const signInUrl = new URL("/manager/sign-in", publicOrigin(req));
      return NextResponse.redirect(signInUrl);
    }

    // profileComplete check is done in the onboarding page itself
    return handleI18nRouting(req);
  }

  // ── All other routes: locale routing + static/api pass-through ──────────
  // Skip API routes — no locale handling needed
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Public judging board — no auth, no locale rewrite
  if (isJudgingRoute(req)) return NextResponse.next();

  // Run next-intl locale routing (handles locale prefix redirects + detection)
  return handleI18nRouting(req);
});

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and all files in public/
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|otf|map)).*)",
  ],
};
