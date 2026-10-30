import { expect, test } from "@playwright/test";
import { signInAs } from "./sign-in";

for (const path of ["/", "/requests", "/approvals", "/admin", "/no-access"]) {
  test(`signed out: ${path} goes to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
}

test("unknown address shows our 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("sign out ends the session and returns to sign-in", async ({ page }) => {
  // Own fresh session, so the saved test sessions stay signed in.
  test.setTimeout(90_000); // may wait for a fresh authenticator code
  await signInAs(page, "approver");
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/approvals");
  await expect(page).toHaveURL(/\/sign-in/);
});

// F18c-2: the invitation page is public (no account yet); a missing or
// broken ticket shows the "ask Raju" message and no form. (The full accept
// is tried by hand: Clerk's development instance sends its webhooks to
// production, so a test account would land in the cloud database.)
for (const [label, path] of [
  ["no ticket", "/accept-invitation"],
  ["a broken ticket", "/accept-invitation?__clerk_ticket=not-a-real-ticket"],
] as const) {
  test(`accept invitation with ${label}: the link doesn't work`, async ({
    page,
  }) => {
    test.setTimeout(90_000); // Clerk retries a broken ticket a few times
    await page.goto(path);
    await expect(page).toHaveURL(/\/accept-invitation/);
    await expect(
      page.getByRole("heading", { name: "This link doesn't work" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Ask Raju to send it again/)).toBeVisible();
    await expect(page.getByLabel(/^Password/)).toHaveCount(0);
  });
}
