import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});

test("admin lands on Requests with the admin menu", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/requests");
  const menu = page.getByRole("navigation", { name: "Main" });
  for (const label of ["Reports", "Audit log", "Admin", "Requests"]) {
    await menu.getByRole("link", { name: label }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: label }),
    ).toBeVisible();
  }
});

test("admin is not an approver: Approvals shows 403", async ({ page }) => {
  await page.goto("/approvals");
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" }),
  ).toBeVisible();
});
