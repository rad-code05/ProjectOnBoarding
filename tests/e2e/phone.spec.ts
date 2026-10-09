import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { openApp } from "./open";
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
    await openApp(page, "/");
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

  test("requests list fits the phone", async ({ page }) => {
    await openApp(page, "/requests");
    await expect(
      page
        .getByRole("region", { name: "Summary" })
        .getByText("Awaiting Moises"),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search name, email or ticket" }),
    ).toBeVisible();
    // Phones get cards or the empty state — never the desktop table.
    await expect(page.getByRole("table")).not.toBeVisible();
    await expectNoSideScroll(page);
  });

  test("request form fits the phone; fields are big enough not to zoom", async ({
    page,
  }) => {
    await openApp(page, "/requests");
    await page.getByRole("button", { name: "New request" }).first().click();
    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    const firstName = page.getByLabel("First name");
    await expect(firstName).toBeVisible();
    // iPhone zooms into inputs with text under 16px.
    expect(
      await firstName.evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("16px");
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeInViewport();
    await expectNoSideScroll(page);

    // Section chips jump to a section and open it.
    const sections = page.getByRole("navigation", { name: "Form sections" });
    await sections.getByRole("link", { name: "6 Equipment" }).click();
    await expect(
      page.getByRole("heading", { name: "IT equipment" }),
    ).toBeInViewport();

    // Section 6 on a phone: Add equipment opens the sheet.
    await page.getByRole("button", { name: "Add equipment" }).click();
    const equipmentSheet = page.getByRole("dialog", { name: "Add equipment" });
    await equipmentSheet.getByText("Laptop · macOS", { exact: true }).click();
    await equipmentSheet.getByText("Issue", { exact: true }).click();
    await equipmentSheet.getByLabel("Asset tag / serial").fill("LN-0042");
    await equipmentSheet.getByRole("button", { name: "Done" }).click();
    await expect(equipmentSheet).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /^Laptop · macOS, Issue, Asset LN-0042/,
      }),
    ).toBeVisible();

    // Start execution asks first, in a sheet that fits the phone.
    await page.getByRole("button", { name: "Start execution" }).click();
    const start = page.getByRole("dialog", { name: "Start execution?" });
    await expect(start.getByRole("button", { name: "Not yet" })).toBeVisible();
    await expectNoSideScroll(page);
    await start.getByRole("button", { name: "Not yet" }).click();
    await expect(start).toHaveCount(0);
    await expectNoSideScroll(page);

    // Section 5 on a phone: a row opens the edit sheet.
    await page.getByRole("button", { name: /^Figma: not set/ }).click();
    const sheet = page.getByRole("dialog", { name: "Figma" });
    await sheet.getByText("Grant", { exact: true }).click();
    await sheet.getByText("Editor", { exact: true }).click();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Figma: Grant · Editor/ }),
    ).toBeVisible();
    await expectNoSideScroll(page);
  });

  test("My profile fits the phone", async ({ page }) => {
    await openApp(page, "/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "My profile" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Signature & initials" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Initials (up to 4 characters)"),
    ).toBeVisible();
    await expectNoSideScroll(page);

    // The draw sheet fits too (nothing is saved here).
    await page.getByRole("button", { name: /^(Replace|Upload)$/ }).click();
    const sheet = page.getByRole("dialog", { name: "Replace signature" });
    await expect(
      sheet.getByRole("img", { name: /Pad to draw your signature/ }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Save as active" }),
    ).toBeVisible();
    await expectNoSideScroll(page);
    await sheet.getByRole("button", { name: "Cancel" }).click();
  });

  test("Password & MFA fits the phone", async ({ page }) => {
    await openApp(page, "/profile/security");
    await expect(
      page.getByRole("heading", { level: 1, name: "Password & MFA" }),
    ).toBeVisible();
    for (const name of [
      "Change password",
      "Authenticator app",
      "Backup codes",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expectNoSideScroll(page);
    await page.getByRole("button", { name: "Set up on a new phone" }).click();
    const sheet = page.getByRole("dialog", { name: "Set up on a new phone" });
    await expect(sheet.getByRole("button", { name: "Start" })).toBeVisible();
    await expectNoSideScroll(page);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toHaveCount(0);
  });

  test("403 and 404 pages fit the phone", async ({ page }) => {
    await openApp(page, "/approvals");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expectNoSideScroll(page);
    await openApp(page, "/this-page-does-not-exist");
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
    await openApp(page, "/");
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
