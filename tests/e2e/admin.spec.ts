import sharp from "sharp";
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
  // No click: the form saves on its own after a short pause.
  await expect(page.getByRole("status").first()).toHaveText(/^Saved \d\d:\d\d/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Anna Keller" }),
  ).toBeVisible();

  await openApp(page, `/requests?q=${ticketId}`);
  await expect(
    page.getByRole("table").getByRole("row", { name: /Anna Keller/ }),
  ).toContainText(ticketId);
});

test("two tabs: the later save is refused and says 'changed somewhere else'", async ({
  page,
  context,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const other = await context.newPage();
  await setupClerkTestingToken({ page: other });
  await openApp(other, page.url());

  await page.getByLabel("First name").fill("Anna");
  await expect(page.getByRole("status").first()).toHaveText(/^Saved/);

  await other.getByLabel("Job title / role").fill("Senior Product Designer");
  await expect(
    other.getByRole("heading", {
      name: "This request was changed somewhere else",
    }),
  ).toBeVisible();
  await expect(
    other.getByText("Job title / role: Senior Product Designer"),
  ).toBeVisible();
  await expect(other.getByLabel("Job title / role")).toBeDisabled();

  await Promise.all([
    other.waitForEvent("load"),
    other.getByRole("button", { name: "Load the latest version" }).click(),
  ]);
  await expect(other.getByLabel("First name")).toHaveValue("Anna");
});

test("Raju sets Slack, Figma and Google Workspace; Hexnode offers Enroll / Remove", async ({
  page,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);

  await expect(
    page.getByLabel("Hexnode (MDM) action").locator("option"),
  ).toHaveText(["—", "Enroll", "Remove"]);

  for (const [app, action, permission] of [
    ["Slack", "Grant", "Member"],
    ["Figma", "Grant", "Editor"],
    ["Google Workspace", "Grant", "User"],
  ]) {
    await page.getByLabel(`${app} action`).selectOption(action);
    await page.getByLabel(`${app} permission`).selectOption(permission);
  }
  await expect(page.getByText("3 of 26 set")).toBeVisible();

  // "N of 26 set" replaces "Saving…" once every choice is stored.
  await openApp(page, page.url());
  await expect(page.getByLabel("Figma permission")).toHaveValue("Editor");
  await expect(page.getByLabel("Slack action")).toHaveValue("Grant");
  await expect(page.getByText("3 of 26 set")).toBeVisible();
});

test("Raju adds an Other application (Notion) and it stays on the request", async ({
  page,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Add other application" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Done" })).toBeDisabled();
  await dialog.getByLabel("Application name").fill("Notion");
  await dialog.getByText("Grant", { exact: true }).click();
  await dialog.getByLabel("Permission / role").fill("Member");
  await dialog.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("button", {
    name: "Notion: Grant · Member. Change",
  });
  await expect(row).toBeVisible();
  await expect(page.getByText("0 of 26 set · 1 other")).toBeVisible();

  await openApp(page, page.url());
  await expect(row).toBeVisible();
});

test("Raju records equipment (Other needs a description) and office access", async ({
  page,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);

  // Section 6: "Other" equipment needs a description before Done works.
  await page.getByRole("button", { name: "Add equipment" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("Other", { exact: true }).click();
  await sheet.getByText("Issue", { exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Done" })).toBeDisabled();
  await sheet.getByLabel(/^Description/).fill("Monitor 27″");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("button", { name: /^Other, Issue, Monitor 27″/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "IT equipment" }).getByRole("status"),
  ).toHaveText("1 item");

  // Section 7: office access with a badge.
  await page
    .getByRole("button", { name: "Office access: not set. Change" })
    .click();
  const access = page.getByRole("dialog", { name: "Office access" });
  await access.getByText("Grant", { exact: true }).click();
  await access.getByText("Badge", { exact: true }).click();
  await access.getByRole("button", { name: "Done" }).click();
  await expect(
    page
      .getByRole("region", { name: "Physical & logical access" })
      .getByRole("status"),
  ).toHaveText("1 of 3 set");

  // Both are stored: still there after a reload.
  await openApp(page, page.url());
  await expect(
    page.getByRole("button", { name: /^Other, Issue, Monitor 27″/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Office access: Grant · Badge. Change" }),
  ).toBeVisible();
});

test("Raju starts execution and ticks section 9; the start time is recorded", async ({
  page,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Start execution" }).click();
  const sheet = page.getByRole("dialog", { name: "Start execution?" });
  await sheet.getByRole("button", { name: "Start execution" }).click();
  await expect(page.getByRole("group", { name: "Status" })).toHaveText(
    "In execution",
  );

  const section9 = page.getByRole("region", {
    name: "IT execution confirmation",
  });
  await expect(section9.getByRole("status")).toHaveText("0 of 3 done");
  await expect(
    section9.getByText(/\d{1,2} \w{3} \d{4}, \d\d:\d\d/),
  ).toBeVisible();
  for (const item of [
    "All authorised access provisioned or modified",
    "Devices issued and enrolled (MDM)",
    "Security controls applied (MFA, MDM, EDR)",
  ]) {
    await section9.getByRole("checkbox", { name: item }).check();
    await expect(section9.getByRole("status")).not.toHaveText("Saving…");
  }
  await expect(section9.getByRole("status")).toHaveText("3 of 3 done");

  await openApp(page, page.url());
  await expect(
    section9.getByRole("checkbox", {
      name: "Security controls applied (MFA, MDM, EDR)",
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Start execution" }),
  ).toHaveCount(0);
});

test("Raju cancels a request with a reason; it becomes read-only", async ({
  page,
}) => {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Cancel this request…" }).click();
  const sheet = page.getByRole("dialog", { name: "Cancel this request?" });
  await expect(
    sheet.getByRole("button", { name: "Cancel request" }),
  ).toBeDisabled();
  await sheet.getByLabel(/^Reason/).fill("Candidate withdrew");
  await sheet.getByRole("button", { name: "Cancel request" }).click();

  await expect(page.getByRole("group", { name: "Status" })).toHaveText(
    "Cancelled",
  );
  await expect(page.getByText("Reason: Candidate withdrew")).toBeVisible();
  await expect(page.getByLabel("First name")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel this request…" }),
  ).toHaveCount(0);
});

test("My profile: typed initials, then a PNG signature that becomes active", async ({
  page,
}) => {
  await openApp(page, "/profile");
  await expect(
    page.getByRole("heading", { level: 1, name: "My profile" }),
  ).toBeVisible();

  // Typed initials (each run uses fresh ones, so Save is always possible).
  const initials = `T${Date.now() % 1000}`.slice(0, 4);
  await page.getByLabel("Initials (up to 4 characters)").fill(initials);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("radio", { name: /Initials/ })).toBeChecked();

  // A PNG signature, made on the fly: checked in the browser, re-drawn on
  // the server, stored in the private bucket, active afterwards.
  const png = await sharp({
    create: { width: 640, height: 200, channels: 4, background: "#00000000" },
  })
    .png()
    .toBuffer();
  await page.getByRole("button", { name: /^(Replace|Upload)$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Replace signature" });
  await sheet.getByText("Upload PNG").click();
  await sheet.locator('input[type="file"]').setInputFiles({
    name: "signature.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(sheet.getByText("PNG image")).toBeVisible();
  await sheet.getByRole("button", { name: "Save as active" }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByRole("radio", { name: /Signature/ })).toBeChecked();
  await expect(
    page.getByRole("img", { name: "Your current signature" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: /Signature · v\d+/ })
      .first(),
  ).toContainText("Active");
});

test("My profile: a signature drawn on the pad becomes the active one", async ({
  page,
}) => {
  await openApp(page, "/profile");
  await page.getByRole("button", { name: /^(Replace|Upload)$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Replace signature" });
  await expect(sheet.getByRole("radio", { name: "Draw" })).toBeChecked();

  // Draw two strokes with the mouse (finger and stylus use the same events).
  const pad = sheet.getByRole("img", { name: /Pad to draw your signature/ });
  const box = (await pad.boundingBox())!;
  for (const y of [0.4, 0.6]) {
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        box.x + box.width * (0.15 + i * 0.07),
        box.y + box.height * (y + (i % 2 ? -0.1 : 0.1)),
      );
    }
    await page.mouse.up();
  }
  await sheet.getByRole("button", { name: "Undo" }).click();
  await sheet.getByRole("button", { name: "Save as active" }).click();
  await expect(sheet).toHaveCount(0);

  // Stored like an upload: re-drawn on the server, active, in History.
  await expect(page.getByRole("radio", { name: /Signature/ })).toBeChecked();
  await expect(
    page.getByRole("img", { name: "Your current signature" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: /Signature · v\d+/ })
      .first(),
  ).toContainText("Active");
});

test("Password & MFA opens from My profile; a mismatch is caught before Clerk; MFA sheets cancel safely", async ({
  page,
}) => {
  await openApp(page, "/profile");
  await page.getByRole("link", { name: "Manage password & MFA" }).click();
  await expect(page).toHaveURL(/\/profile\/security$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Password & MFA" }),
  ).toBeVisible();
  // The test user signs in with an authenticator app.
  await expect(
    page.getByRole("region", { name: "Authenticator app" }),
  ).toContainText("On");

  // Only the safe path: the shared test user's password must never change.
  await page.getByLabel("Current password").fill("not-the-real-one");
  await page.getByLabel("New password", { exact: true }).fill("new-pass-1");
  await page.getByLabel("Repeat new password").fill("new-pass-2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByRole("region", { name: "Change password" }).getByRole("alert"),
  ).toHaveText("The new passwords don't match.");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The MFA sheets open and Cancel changes nothing (never press Start or
  // Make new codes here: the shared test user's MFA must stay as it is).
  await page.getByRole("button", { name: "Set up on a new phone" }).click();
  const phone = page.getByRole("dialog", { name: "Set up on a new phone" });
  await expect(phone).toContainText("Your old phone stops working");
  await phone.getByRole("button", { name: "Cancel" }).click();
  await expect(phone).toHaveCount(0);

  await page.getByRole("button", { name: "Make new backup codes" }).click();
  const codes = page.getByRole("dialog", { name: "Make new backup codes" });
  await expect(codes).toContainText("stop working");
  await codes.getByRole("button", { name: "Cancel" }).click();
  await expect(codes).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Authenticator app" }),
  ).toContainText("On");
});

test("Raju reviews and signs a request; it awaits confirmation with his signature in section 11", async ({
  page,
}) => {
  test.slow(); // a whole journey: profile, form, execution, signing
  // Make sure there is an active signature (typed initials are enough).
  await openApp(page, "/profile");
  await page
    .getByLabel("Initials (up to 4 characters)")
    .fill(`S${Date.now() % 1000}`.slice(0, 4));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("radio", { name: /Initials/ })).toBeChecked();

  // A fresh request with every required field.
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await page.getByLabel("First name").fill("Sina");
  await page.getByLabel("Last name").fill("Signer");
  await page
    .getByLabel("Work email")
    .fill(`sina.signer.${Date.now()}@laine.ai`);
  await page.getByLabel("Job title / role").fill("Analyst");
  await page
    .getByLabel("Department / team")
    .selectOption({ label: "Engineering" });
  await page.getByLabel("Country").selectOption("CH");
  await page.getByLabel("Manager").fill("Mara Manager");
  await page.getByLabel("Requested by").fill("Rita Requestor");
  await page.getByLabel("Effective date").fill("2026-11-02");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").first()).toHaveText(/^Saved/);

  await page.getByRole("button", { name: "Start execution" }).click();
  await page
    .getByRole("dialog", { name: "Start execution?" })
    .getByRole("button", { name: "Start execution" })
    .click();
  const section9 = page.getByRole("region", {
    name: "IT execution confirmation",
  });
  for (const item of [
    "All authorised access provisioned or modified",
    "Devices issued and enrolled (MDM)",
    "Security controls applied (MFA, MDM, EDR)",
  ]) {
    await section9.getByRole("checkbox", { name: item }).check();
    await expect(section9.getByRole("status")).not.toHaveText("Saving…");
  }
  await expect(section9.getByRole("status")).toHaveText("3 of 3 done");

  // Review & sign
  await page
    .getByRole("button", { name: "Review & sign", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Review & sign" });
  const checks = sheet.getByRole("list", { name: "Checks before signing" });
  await expect(checks).toContainText("All required fields complete");
  await expect(checks).toContainText("Section 9 checklist complete");
  await expect(checks).toContainText("Your signature is on file");
  await expect(sheet.getByText("Sina Signer")).toBeVisible();
  const sign = sheet.getByRole("button", { name: /^Sign & send/ });
  await expect(sign).toBeDisabled();
  await sheet.getByLabel(/I confirm the details above/).check();
  await sign.click();
  await expect(sheet).toHaveCount(0);

  // Awaiting confirmation, signed, locked.
  await expect(page.getByRole("group", { name: "Status" })).toHaveText(
    "Awaiting confirmation",
  );
  const section11 = page.getByRole("region", { name: "Signatures & sign-off" });
  await expect(section11).toContainText("Signed by");
  await expect(section11).toContainText(/Fingerprint [0-9a-f]{16}/);
  await expect(section11).toContainText("Waiting for the approver");
  await expect(page.getByLabel("First name")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review & sign", exact: true }),
  ).toHaveCount(0);
});
