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

test("offboarding journey: onboard, close, Who is leaving?, remove, sign, Moises confirms, PDF", async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000); // two requests, four signatures

  const rajuContext = await browser.newContext({
    storageState: authFile("admin"),
  });
  const raju = await rajuContext.newPage();
  await setupClerkTestingToken({ page: raju });
  await saveInitials(raju);
  await saveInitials(page);

  // 1. Raju onboards Ola with Slack (Member); Moises closes it.
  const onboardingTicket = await createExecutedRequest(raju, "Ola");
  const email = await raju.getByLabel("Work email").inputValue();
  await raju.getByLabel("Slack action").selectOption("Grant");
  await raju.getByLabel("Slack permission").selectOption("Regular Member");
  // "N of M set" replaces "Saving…" once the choice is stored.
  await expect(
    raju
      .getByRole("region", { name: "Application access" })
      .getByRole("status")
      .first(),
  ).toHaveText(/^1 of \d+ set$/);
  await openApp(raju, raju.url());
  await expect(raju.getByLabel("Slack permission")).toHaveValue(
    "Regular Member",
  );
  await reviewAndSign(raju);

  const confirmOnApprovals = async (ticketId: string) => {
    await openApp(page, "/approvals");
    await page
      .getByRole("listitem")
      .filter({ hasText: ticketId })
      .getByRole("link", { name: "Review & confirm" })
      .click();
    await page.getByRole("button", { name: "Confirm & sign" }).click();
    return page.getByRole("dialog", { name: "Confirm & sign" });
  };
  let confirm = await confirmOnApprovals(onboardingTicket);
  await confirm.getByLabel(/I have reviewed this record/).check();
  await confirm.getByRole("button", { name: "Confirm, sign & close" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed, signed and closed",
  );

  // 2. Who is leaving? Ola, found by email; Slack is pre-filled.
  await openApp(raju, "/requests");
  await raju.getByRole("button", { name: "New request" }).first().click();
  await raju
    .getByRole("dialog", { name: "New onboarding" })
    .getByText("Offboarding", { exact: true })
    .click();
  const leaving = raju.getByRole("dialog", { name: "Who is leaving?" });
  await leaving.getByLabel("Find the person").fill(email);
  await leaving.getByRole("radio", { name: /Ola Loop/ }).check();
  await leaving.getByRole("button", { name: "Offboard Ola" }).click();
  await expect(raju).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const offboardingUrl = raju.url();
  const offboardingTicket = await raju
    .getByText(/^UAM-\d{4}-\d{6}$/)
    .first()
    .innerText();
  const apps = raju.getByRole("region", { name: "Applications to remove" });
  await expect(apps).toContainText("Slack");
  await expect(apps).toContainText("had Regular Member");

  // 3. SLA (within 48h of today 00:00 Dubai → met), handover, start.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
  }).format(new Date());
  const sla = raju.getByRole("region", { name: "Access removal SLA" });
  await sla.getByText("Within 48h", { exact: true }).click();
  await sla.getByLabel("Last working day").fill(today);
  await sla.getByLabel("Access cut-off date").fill(today);
  await sla.getByLabel("Time", { exact: true }).fill("00:00");
  await raju.getByLabel("Effective date").fill(today);
  await raju.getByLabel("Data & mailbox go to").fill("Mara Manager");
  await raju.getByRole("button", { name: "Save draft" }).click();
  await expect(raju.getByRole("status").first()).toHaveText(
    /^(All changes saved|Saved) \d\d:\d\d/,
  );
  await raju.getByRole("button", { name: "Start execution" }).click();
  await raju
    .getByRole("dialog", { name: "Start execution?" })
    .getByRole("button", { name: "Start execution" })
    .click();

  // 4. Delete Slack and tick it; mailbox; section 9.
  const slack = apps.getByRole("group", { name: "How Slack is removed" });
  await slack.getByText("Delete", { exact: true }).click();
  await expect(apps.getByRole("checkbox", { name: /Slack/ })).toBeEnabled();
  await apps.getByRole("checkbox", { name: /Slack/ }).check();
  await expect(apps.getByText(/^Removed \d\d:\d\d$/)).toBeVisible();
  await raju.getByRole("radio", { name: /No mailbox to convert/ }).check();
  await expect(raju.getByText(/^Recorded \d/)).toBeVisible();
  const section9 = raju.getByRole("region", {
    name: "IT execution confirmation",
  });
  for (const box of await section9.getByRole("checkbox").all()) {
    await box.check();
    await expect(section9.getByRole("status")).not.toHaveText("Saving…");
  }
  await openApp(raju, offboardingUrl);
  await expect(
    raju.getByRole("heading", { name: "Removed in time" }),
  ).toBeVisible();
  await reviewAndSign(raju);
  await rajuContext.close();

  // 5. Moises sees the SLA result, confirms, lands on the offboarding record.
  confirm = await confirmOnApprovals(offboardingTicket);
  await expect(confirm.getByText("Met · 1 of 1 removed")).toBeVisible();
  await confirm.getByLabel(/I have reviewed this record/).check();
  await confirm.getByRole("button", { name: "Confirm, sign & close" }).click();
  const offboardingId = offboardingUrl.split("/").pop();
  await expect(page).toHaveURL(`/records/${offboardingId}?closed=1`);
  await expect(
    page.getByRole("region", { name: "Access record" }),
  ).toContainText("ola.loop-offboarding.pdf");
  const pdf = await page.request.get(`/records/${offboardingId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-disposition"]).toBe(
    'attachment; filename="ola.loop-offboarding.pdf"',
  );
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("access change journey: Who is changing?, change / keep / add, sign, approver confirms, PDF", async ({
  page,
  browser,
}) => {
  test.setTimeout(480_000); // two requests, four signatures

  const rajuContext = await browser.newContext({
    storageState: authFile("admin"),
  });
  const raju = await rajuContext.newPage();
  await setupClerkTestingToken({ page: raju });
  await saveInitials(raju);
  await saveInitials(page);

  const confirmOnApprovals = async (ticketId: string) => {
    await openApp(page, "/approvals");
    await page
      .getByRole("listitem")
      .filter({ hasText: ticketId })
      .getByRole("link", { name: "Review & confirm" })
      .click();
    await page.getByRole("button", { name: "Confirm & sign" }).click();
    return page.getByRole("dialog", { name: "Confirm & sign" });
  };

  // 1. Raju onboards Ada with Slack and Figma; the approver closes it.
  const onboardingTicket = await createExecutedRequest(raju, "Ada");
  const email = await raju.getByLabel("Work email").inputValue();
  for (const [app, permission] of [
    ["Slack", "Regular Member"],
    ["Figma", "Dev"],
  ]) {
    await raju.getByLabel(`${app} action`).selectOption("Grant");
    await raju.getByLabel(`${app} permission`).selectOption(permission);
  }
  await expect(
    raju
      .getByRole("region", { name: "Application access" })
      .getByRole("status")
      .first(),
  ).toHaveText(/^2 of \d+ set$/);
  await reviewAndSign(raju);
  let confirm = await confirmOnApprovals(onboardingTicket);
  await confirm.getByLabel(/I have reviewed this record/).check();
  await confirm.getByRole("button", { name: "Confirm, sign & close" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirmed, signed and closed",
    { timeout: 30_000 },
  );

  // 2. New request → Access change → Who is changing? → Ada.
  await openApp(raju, "/requests");
  await raju.getByRole("button", { name: "New request" }).first().click();
  await raju
    .getByRole("dialog", { name: "New onboarding" })
    .getByText("Access change", { exact: true })
    .click();
  const changing = raju.getByRole("dialog", { name: "Who is changing?" });
  await changing.getByLabel("Find the person").fill(email);
  await changing.getByRole("radio", { name: /Ada Loop/ }).check();
  await changing.getByRole("button", { name: "Change Ada's access" }).click();
  await expect(raju).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const changeUrl = raju.url();
  const changeTicket = await raju
    .getByText(/^UAM-\d{4}-\d{6}$/)
    .first()
    .innerText();
  await expect(raju.getByText(/What Ada has today/)).toContainText(
    "2 applications",
  );

  // 3. Slack → Workspace Owner; Figma kept; GitHub added as new.
  const apps = raju.getByRole("region", { name: "Applications they have" });
  await expect(apps).toContainText("Slack");
  await expect(apps).toContainText("Figma");
  await apps
    .getByRole("group", { name: /^Slack: keep/ })
    .getByText("Change", { exact: true })
    .click();
  const sheet = raju.getByRole("dialog", { name: "Slack" });
  await expect(sheet).toContainText("Ada has today");
  await sheet.getByText("Workspace Owner", { exact: true }).click();
  await sheet
    .getByRole("button", { name: "Change to Workspace Owner" })
    .click();
  await expect(apps).toContainText("Regular Member → Workspace Owner");
  await expect(apps).toContainText("1 changed · 1 kept");
  // Held apps aren't offered as new; GitHub is.
  await expect(raju.getByLabel("Slack action")).toHaveCount(0);
  await raju.getByLabel("GitHub action").selectOption("Grant");
  await raju.getByLabel("GitHub permission").selectOption("Maintain");
  await expect(
    raju
      .getByRole("region", { name: "Application access" })
      .getByRole("status")
      .first(),
  ).toHaveText(/^1 of \d+ set$/);

  // 4. A new role: the job title shows what it was; the date it applies.
  await raju.getByLabel("Job title / role").fill("Lead");
  await expect(raju.getByText("Was: Analyst")).toBeVisible();
  await raju.getByLabel("Effective date").fill("2026-11-16");
  await raju.getByRole("button", { name: "Save draft" }).click();
  await expect(raju.getByRole("status").first()).toHaveText(
    /^(All changes saved|Saved) \d\d:\d\d/,
  );

  // 5. After a reload everything is still there; execution and section 9.
  await openApp(raju, changeUrl);
  await expect(apps).toContainText("Regular Member → Workspace Owner");
  await expect(raju.getByLabel("Job title / role")).toHaveValue("Lead");
  await raju.getByRole("button", { name: "Start execution" }).click();
  await raju
    .getByRole("dialog", { name: "Start execution?" })
    .getByRole("button", { name: "Start execution" })
    .click();
  const section9 = raju.getByRole("region", {
    name: "IT execution confirmation",
  });
  await expect(section9.getByRole("checkbox").first()).toBeVisible();
  // Pre-filled by what changed (2026-10-14): apps changed → Yes (ticked);
  // no device line → no changes made.
  await expect(
    section9.getByRole("checkbox", { name: /All authorised access modified/ }),
  ).toBeChecked();
  await expect(section9).toContainText(
    "Devices issued and enrolled (MDM) — no changes made",
  );
  for (const box of await section9.getByRole("checkbox").all()) {
    if (!(await box.isEnabled())) continue;
    await box.check();
    await expect(section9.getByRole("status")).not.toHaveText("Saving…");
  }
  await expect(section9.getByRole("status")).toHaveText(/^3 of 3 done$/);
  await reviewAndSign(raju);
  await rajuContext.close();

  // 6. The approver sees what changes, was → now and what is kept; confirms.
  confirm = await confirmOnApprovals(changeTicket);
  await expect(
    confirm.getByRole("region", { name: "What changes" }),
  ).toContainText("Regular Member → Workspace Owner");
  await expect(
    confirm.getByRole("region", { name: "What changes" }),
  ).toContainText("Added · Grant · Maintain");
  await expect(
    confirm.getByRole("region", { name: "Employee · was → now" }),
  ).toContainText("Analyst → Lead");
  await expect(
    confirm.getByRole("region", { name: "Kept unchanged · 1" }),
  ).toContainText("Figma");
  await confirm.getByLabel(/I have reviewed this record/).check();
  await confirm.getByRole("button", { name: "Confirm, sign & close" }).click();

  // 7. The record page and the PDF.
  const changeId = changeUrl.split("/").pop();
  await expect(page).toHaveURL(`/records/${changeId}?closed=1`, {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("region", { name: "Access record" }),
  ).toContainText("ada.loop-access-modification.pdf");
  await page.getByText("Kept unchanged", { exact: true }).click();
  await expect(page.getByText("Dev", { exact: true })).toBeVisible();
  const pdf = await page.request.get(`/records/${changeId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-disposition"]).toBe(
    'attachment; filename="ada.loop-access-modification.pdf"',
  );
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
