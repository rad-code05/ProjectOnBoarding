import { auth } from "@clerk/nextjs/server";

/**
 * Call at the top of EVERY page, Route Handler and Server Action that needs a
 * signed-in user. Signed-out page requests are redirected to /sign-in;
 * other requests get 404. (Clerk recommends per-resource checks over
 * middleware route matchers.)
 */
export async function requireUser() {
  const { userId } = await auth.protect();
  return { userId };
}
