import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { totpCode } from "./totp";

export type TestUser = "admin" | "approver";

const ENV = {
  admin: { email: "E2E_ADMIN_EMAIL", totp: "E2E_ADMIN_TOTP_SECRET" },
  approver: { email: "E2E_APPROVER_EMAIL", totp: "E2E_APPROVER_TOTP_SECRET" },
} as const;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} (see .env.example)`);
  return value;
}

/** One-time sign-in ticket from Clerk's Backend API (dev instance only). */
async function signInTicket(email: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${env("CLERK_SECRET_KEY")}`,
    "Content-Type": "application/json",
  };
  const users = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers },
  ).then((res) => res.json());
  if (!users[0]) throw new Error(`No Clerk user ${email}`);
  const { token } = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: users[0].id, expires_in_seconds: 300 }),
  }).then((res) => res.json());
  return token;
}

/**
 * Signs a test user in without the sign-in screens: a ticket replaces the
 * password, and the authenticator code is computed from the user's key
 * (MFA is required for everyone, test users included).
 */
export async function signInAs(page: Page, user: TestUser) {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await clerk.loaded({ page });

  const ticket = await signInTicket(env(ENV[user].email));
  const secret = env(ENV[user].totp);

  // Clerk rejects the same code twice; if a code was just used (another
  // sign-in of this user), try once more in the next 30-second window.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await page.evaluate(
      async ({ ticket, code }) => {
        const signIn = window.Clerk.client!.signIn;
        let res =
          signIn.status === "needs_second_factor"
            ? signIn
            : await signIn.create({ strategy: "ticket", ticket });
        if (res.status === "needs_second_factor") {
          try {
            res = await res.attemptSecondFactor({ strategy: "totp", code });
          } catch (err) {
            return { ok: false, error: String(err) };
          }
        }
        if (res.status !== "complete") {
          return { ok: false, error: `status ${res.status}` };
        }
        await window.Clerk.setActive({ session: res.createdSessionId });
        return { ok: true, error: "" };
      },
      { ticket, code: totpCode(secret) },
    );
    if (result.ok) return;
    if (attempt === 1) throw new Error(`Sign-in failed: ${result.error}`);
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 1_000);
  }
}
