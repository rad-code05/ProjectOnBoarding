import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { openApp } from "./open";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});

test("admin lands on Requests with the admin menu", async ({ page }) => {
  await openApp(page, "/");
  await expect(page).toHaveURL(/\/requests$/);
  const menu = page.getByRole("navigation", { name: "Main" });
  await expect(menu.getByRole("link")).toHaveText([
    "Requests",
    "Reports",
    "Audit log",
    "Admin",
  ]);
  await expect(menu.getByRole("link", { name: "Requests" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("admin can open every menu page", async ({ page }) => {
  await openApp(page, "/requests");
  const menu = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Reports", "Audit log", "Admin", "Requests"]) {
    await menu.getByRole("link", { name: label }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: label }),
    ).toBeVisible();
  }
});

test("admin is not an approver: Approvals shows 403", async ({ page }) => {
  await openApp(page, "/approvals");
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" }),
  ).toBeVisible();
});

test("requests list: tiles and filters in the address", async ({ page }) => {
  await openApp(page, "/requests");
  for (const label of [
    "Drafts",
    "In execution",
    "Awaiting Moises",
    "Onboarded this month",
  ]) {
    await expect(
      page
        .getByRole("region", { name: "Summary" })
        .getByText(label, { exact: true }),
    ).toBeVisible();
  }
  // Either the first-day empty state or the list — both are valid here.
  await expect(
    page
      .getByRole("heading", { name: "No requests yet" })
      .or(page.getByRole("table")),
  ).toBeVisible();

  await page.getByRole("radio", { name: "Offboarding" }).click();
  await expect(page).toHaveURL(/\/requests\?type=offboarding$/);
  await expect(page.getByRole("radio", { name: "Offboarding" })).toBeChecked();
});

test("New request creates a draft; Raju saves Anna Keller and finds her", async ({
  page,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "New request" }),
  ).toBeVisible();
  const ticketId = await page
    .getByText(/^UAM-\d{4}-\d{6}$/)
    .first()
    .innerText();

  await page.getByLabel("First name").fill("Anna");
  await page.getByLabel("Last name").fill("Keller");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Enter a valid email address/)).toBeVisible();

  await page.getByLabel("Work email").fill("anna.keller@laine.ai");
  await page.getByLabel("Country").selectOption("CH");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveText(/^Saved \d\d:\d\d/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Anna Keller" }),
  ).toBeVisible();

  await openApp(page, `/requests?q=${ticketId}`);
  await expect(
    page.getByRole("table").getByRole("row", { name: /Anna Keller/ }),
  ).toContainText(ticketId);
});
