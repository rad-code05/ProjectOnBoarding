import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Fetches a Clerk testing token (needs CLERK_SECRET_KEY of the *dev*
 * instance — Clerk refuses production keys). Runs in the main process, so
 * every test worker inherits it; it lets tests pass Clerk's bot protection.
 */
export default async function globalSetup() {
  await clerkSetup();
}
