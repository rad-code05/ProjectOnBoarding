import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { openApp } from "./open";
import { expect, test } from "@playwright/test";
import { authFile } from "../../playwright.config";
import { createExecutedRequest, reviewAndSign, saveInitials } from "./journey";

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

test("full loop: Raju signs, Moises returns it, Raju signs again, Moises confirms and it closes", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000); // two people, two signatures, one return

  // Raju (admin test user) in a second browser session.
  const rajuContext = await browser.newContext({
    storageState: authFile("admin"),
  });
  const raju = await rajuContext.newPage();
  await setupClerkTestingToken({ page: raju });
  await saveInitials(raju);
  const ticketId = await createExecutedRequest(raju, "Lina");
  const requestUrl = raju.url();
  await reviewAndSign(raju);

  // Moises (approver test user): needs a signature of his own.
  await saveInitials(page);
  await openApp(page, "/approvals");
  const card = page.getByRole("listitem").filter({ hasText: ticketId });
  await card.getByRole("link", { name: "Review & confirm" }).click();
  await expect(page).toHaveURL(/\/approvals\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Lina Loop" }),
  ).toBeVisible();

  // Return to Raju with section 5 flagged.
  await page.getByRole("button", { name: "Return to Raju" }).click();
  const back = page.getByRole("dialog", { name: "Return to Raju" });
  await back.getByLabel("5 · Application access").check();
  await back.getByLabel(/Comment for Raju/).fill("Add Figma as Viewer");
  await back.getByRole("button", { name: "Return to Raju" }).click();
  await expect(page).toHaveURL(/\/approvals$/);

  // Raju sees it returned with the comment, and signs again.
  await openApp(raju, requestUrl);
  await expect(raju.getByRole("group", { name: "Status" })).toHaveText(
    "Returned",
  );
  await expect(raju.getByText("Add Figma as Viewer")).toBeVisible();
  await reviewAndSign(raju);
  await rajuContext.close();

  // Moises confirms.
  await openApp(page, "/approvals");
  await page
    .getByRole("listitem")
    .filter({ hasText: ticketId })
    .getByRole("link", { name: "Review & confirm" })
    .click();
  await page.getByRole("button", { name: "Confirm & sign" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm & sign" });
  await expect(confirm.getByText(/Fingerprint [0-9a-f]{16}/)).toBeVisible();
  await confirm.getByLabel(/I have reviewed this record/).check();
  await confirm.getByRole("button", { name: "Confirm, sign & close" }).click();
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(
    page.getByRole("region", { name: "Recently closed" }),
  ).toContainText(ticketId);
});
