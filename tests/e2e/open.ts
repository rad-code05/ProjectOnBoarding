import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Opens an app page and waits until Clerk's script is ready. Clerk's session
 * token lives ~60 s and the script refreshes it; clicking around before that
 * can send an expired token, and the server then treats the user as signed
 * out ("session-token-expired-refresh-non-eligible-no-refresh-cookie").
 */
export async function openApp(page: Page, path: string) {
  await page.goto(path);
  await clerk.loaded({ page });
}
