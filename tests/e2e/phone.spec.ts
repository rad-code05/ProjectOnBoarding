import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "../../playwright.config";

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});

/** The page must never scroll sideways on a phone. */
async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  return page.locator("#phone-menu");
}

test.describe("admin on a phone", () => {
  test.use({ storageState: authFile("admin") });

  test("compact bar, menu with the admin pages, no sideways scroll", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/requests$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Requests" }),
    ).toBeVisible();
    // The desktop menu is hidden; the menu button is there instead.
    await expect(
      page.getByRole("navigation", { name: "Main" }),
    ).not.toBeVisible();
    await expectNoSideScroll(page);

    const menu = await openMenu(page);
    await expect(menu.getByRole("link")).toHaveText([
      "Requests",
      "Reports",
      "Audit log",
      "Admin",
      /Raju|e2e|admin/i,
    ]);
    await expect(menu.getByRole("link", { name: "Requests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();

    await menu.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(menu).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "Reports" }),
    ).toBeVisible();
  });

  test("403 and 404 pages fit the phone", async ({ page }) => {
    await page.goto("/approvals");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expectNoSideScroll(page);
    await page.goto("/this-page-does-not-exist");
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expectNoSideScroll(page);
  });
});

test.describe("approver on a phone", () => {
  test.use({ storageState: authFile("approver") });

  test("lands on Approvals; menu shows the approver pages", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/approvals$/);
    await expectNoSideScroll(page);
    const menu = await openMenu(page);
    await expect(
      menu.getByRole("navigation", { name: "Main" }).getByRole("link"),
    ).toHaveText(["Approvals", "Records", "Reports"]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
});
