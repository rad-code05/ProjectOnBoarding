/**
 * Who may get an email from this copy of the app (F23b-3, pure).
 *
 * - No Resend key → nothing is sent; emails wait in the outbox.
 * - Preview sites (pull requests) never send.
 * - Production sends to everyone but the test accounts (stand-in Clerk
 *   addresses with no real mailbox — an email to them bounces).
 * - Every other site (local, CI, development) emails the test accounts only.
 */
export type SendMode =
  | { mode: "off"; reason: string }
  | { mode: "test_accounts" }
  | { mode: "everyone" };

type Env = Partial<Record<string, string | undefined>>;

export function sendMode(env: Env): SendMode {
  if (!env.RESEND_API_KEY)
    return {
      mode: "off",
      reason: "No Resend key — emails wait in the outbox.",
    };
  if (env.VERCEL_ENV === "preview")
    return { mode: "off", reason: "Preview sites never send emails." };
  if (env.VERCEL_ENV === "production") return { mode: "everyone" };
  return { mode: "test_accounts" };
}

/** The browser-test accounts (same rule as private.is_test_email()). */
const TEST_EMAIL = /^e2e\.[^@]*\+clerk_test@/i;

export function isTestAccountEmail(email: string): boolean {
  return TEST_EMAIL.test(email.trim());
}

export const TEST_SITE_SKIP = "Test site: only the test accounts get emails.";
export const LIVE_SITE_SKIP =
  "Test account: no real mailbox — the live site doesn't email it.";

/** The sender address (`EMAIL_FROM` overrides it, e.g. before DNS is ready). */
export const DEFAULT_FROM =
  "Laine onboarding rights <no-reply@access-notify.laine.ai>";

export function senderAddress(env: Env): string {
  return env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}
