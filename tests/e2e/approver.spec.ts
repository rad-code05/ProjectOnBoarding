import { createHash } from "node:crypto";
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

test("My profile: the approver picks their own timezone, then goes back to the company default", async ({
  page,
}) => {
  await openApp(page, "/profile");
  const select = page.getByLabel("Show times on my screens in");
  await expect(select).toBeVisible();
  await select.selectOption("Europe/Zurich");
  const timezoneCard = page.getByRole("region", { name: "Timezone" });
  await expect(timezoneCard.getByRole("status")).toHaveText(
    /^Saved · now \d\d:\d\d in Europe\/Zurich$/,
  );
  await openApp(page, "/profile");
  await expect(select).toHaveValue("Europe/Zurich");
  // Back to the default, so other tests see the company timezone.
  await select.selectOption("");
  await expect(timezoneCard.getByRole("status")).toHaveText(/in Asia\/Dubai$/);
  await openApp(page, "/profile");
  await expect(select).toHaveValue("");
});

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
  const returned = raju.getByRole("region", { name: "Returned" });
  await expect(returned).toContainText("“Add Figma as Viewer”");
  await expect(returned).toContainText("Sections 1–9 are open again");
  const access = raju.getByRole("region", { name: /Application access/ });
  await expect(access.getByText(/^Flagged by /)).toBeVisible();
  await returned
    .getByRole("button", { name: "Go to Application access" })
    .click();
  await expect(access).toBeInViewport();
  await reviewAndSign(raju, "Figma is Viewer now");
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
  await expect(confirm.getByText("Figma is Viewer now")).toBeVisible();
  await expect(confirm.getByText(/Fingerprint [0-9a-f]{16}/)).toBeVisible();
  await confirm.getByLabel(/I have reviewed this record/).check();
  await confirm.getByRole("button", { name: "Confirm, sign & close" }).click();

  // Moises lands on the record (F08c-2) with its PDF.
  const requestId = requestUrl.split("/").pop();
  await expect(page).toHaveURL(`/records/${requestId}?closed=1`);
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed, signed and closed",
  );
  const pdfCard = page.getByRole("region", { name: "Access record" });
  await expect(pdfCard).toContainText("lina.loop-onboarding.pdf");
  await expect(
    pdfCard.getByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", `/records/${requestId}/pdf`);
  await expect(page.getByRole("region", { name: "Signatures" })).toContainText(
    "Figma is Viewer now",
  );
  // The same page fits a phone (D22).
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });

  await openApp(page, "/approvals");
  const recent = page.getByRole("region", { name: "Recently closed" });
  await expect(
    recent.getByRole("link", { name: /Lina Loop/ }).first(),
  ).toHaveAttribute("href", /^\/records\//);
  await expect(recent).toContainText(ticketId);

  // Records (F08d): find it by ticket, open its PDF from the list.
  await recent.getByRole("link", { name: "All records" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Records" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: /Search/ }).fill(ticketId);
  await expect(page).toHaveURL(new RegExp(`q=${ticketId}`));
  await expect(page.getByText("1 record", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download the PDF record of Lina Loop" }),
  ).toHaveAttribute("href", `/records/${requestId}/pdf`);

  // The PDF itself: downloaded with its fingerprint, and every download is
  // the same file.
  const first = await page.request.get(`/records/${requestId}/pdf`);
  expect(first.status()).toBe(200);
  expect(first.headers()["content-type"]).toBe("application/pdf");
  expect(first.headers()["content-disposition"]).toBe(
    'attachment; filename="lina.loop-onboarding.pdf"',
  );
  const bytes = await first.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(first.headers()["x-record-sha256"]).toBe(sha256);
  const again = await page.request.get(`/records/${requestId}/pdf?view=1`);
  expect(again.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(
    createHash("sha256")
      .update(await again.body())
      .digest("hex"),
  ).toBe(sha256);
});
