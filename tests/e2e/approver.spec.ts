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
  ).toHaveText([/^Approvals/, "Records", "Reports"]);
});

test("Approvals shows the tiles, what waits and what closed", async ({
  page,
}) => {
  await openApp(page, "/approvals");
  await expect(
    page.getByRole("heading", { level: 1, name: "Approvals" }),
  ).toBeVisible();
  for (const tile of [
    "Waiting for you",
    "Returned to Raju",
    "Closed this month",
  ]) {
    await expect(page.getByText(tile, { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { level: 2, name: "Waiting for you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Recently closed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Creating and editing requests is done by IT."),
  ).toBeVisible();
});

// Any request page — the role check runs before the request is looked up.
const REQUEST_PAGE = "/requests/00000000-0000-4000-8000-000000000000";

for (const path of ["/admin", "/requests", REQUEST_PAGE, "/audit"]) {
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
