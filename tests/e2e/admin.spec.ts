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

test("requests list: tiles, filters in the address, New request", async ({
  page,
}) => {
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

  await page.getByRole("link", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/new$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "New request" }),
  ).toBeVisible();
});
