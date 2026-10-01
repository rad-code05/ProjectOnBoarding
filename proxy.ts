import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Runs before every matched request (Next.js 16 `proxy.ts`, formerly middleware).
 * It makes the Clerk session available to pages. It is NOT the security check —
 * every page/route/action calls requireUser() itself.
 *
 * Convenience: a session that still has a Clerk task (e.g. first-time MFA
 * setup) is sent to /session-tasks.
 */
export default clerkMiddleware(async (auth, req) => {
  const { sessionStatus } = await auth();
  const { pathname } = req.nextUrl;
  if (sessionStatus === "pending" && !pathname.startsWith("/session-tasks")) {
    return NextResponse.redirect(new URL("/session-tasks", req.url));
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
