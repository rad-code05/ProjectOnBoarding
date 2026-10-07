import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { openApp } from "./open";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});

test("approver lands on Approvals with the approver menu", async ({ page }) => {
  await openApp(page, "/");
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link"),
  ).toHaveText(["Approvals", "Records", "Reports"]);
});

for (const path of ["/admin", "/requests", "/requests/new", "/audit"]) {
  test(`approver opening ${path} gets 403`, async ({ page }) => {
    await openApp(page, path);
    await expect(page).toHaveURL(/\/no-access$/);
    await expect(
      page.getByRole("heading", {
        name: "You don't have access to this page",
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Go to my start page" }).click();
    await expect(page).toHaveURL(/\/approvals$/);
  });
}
