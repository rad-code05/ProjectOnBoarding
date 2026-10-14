import { expect, type Page } from "@playwright/test";
import { openApp } from "./open";

/** Makes sure the signed-in person has an active signature (typed initials). */
export async function saveInitials(page: Page) {
  await openApp(page, "/profile");
  await page
    .getByLabel("Initials (up to 4 characters)")
    .fill(`T${Date.now() % 1000}`.slice(0, 4));
  await page.getByRole("button", { name: "Save" }).click();
  // Other tests may switch the same test user to a PNG at the same time;
  // what this needs is *an* active signature, whichever kind.
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
}

/** As Raju: New request → Start onboarding (F09c: New request opens a sheet). */
export async function newOnboarding(page: Page) {
  await page.getByRole("button", { name: "New request" }).first().click();
  await page
    .getByRole("dialog", { name: "New onboarding" })
    .getByRole("button", { name: "Start onboarding" })
    .click();
}

/**
 * As Raju: a fresh request with every required field, executed (section 9
 * ticked). Returns its ticket ID; the page stays on the request.
 */
export async function createExecutedRequest(page: Page, firstName: string) {
  await openApp(page, "/requests");
  await newOnboarding(page);
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const ticketId = await page
    .getByText(/^UAM-\d{4}-\d{6}$/)
    .first()
    .innerText();
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill("Loop");
  await page
    .getByLabel("Work email")
    .fill(`${firstName.toLowerCase()}.${Date.now()}@laine.ai`);
  await page.getByLabel("Job title / role").fill("Analyst");
  await page
    .getByLabel("Department / team")
    .selectOption({ label: "Engineering" });
  await page.getByLabel("Country").selectOption("CH");
  await page.getByLabel("Manager").fill("Mara Manager");
  await page.getByLabel("Requested by").fill("Rita Requestor");
  await page.getByLabel("Effective date").fill("2026-11-02");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").first()).toHaveText(
    /^(All changes saved|Saved) \d\d:\d\d/,
  );

  await page.getByRole("button", { name: "Start execution" }).click();
  await page
    .getByRole("dialog", { name: "Start execution?" })
    .getByRole("button", { name: "Start execution" })
    .click();
  const section9 = page.getByRole("region", {
    name: "IT execution confirmation",
  });
  // The section appears after Start execution; wait before collecting boxes.
  await expect(section9.getByRole("checkbox").first()).toBeVisible();
  for (const box of await section9.getByRole("checkbox").all()) {
    await box.check();
    await expect(section9.getByRole("status")).not.toHaveText("Saving…");
  }
  await expect(section9.getByRole("status")).toHaveText(/^(\d+) of \1 done$/);
  return ticketId;
}

/**
 * As Raju, on the request page: Review & sign (again, after a return) →
 * optional note for the approver → I confirm → Sign & send.
 */
export async function reviewAndSign(page: Page, note?: string) {
  await page.getByRole("button", { name: /^Review & sign( again)?$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Review & sign" });
  if (note) await sheet.getByLabel(/^Note for .+ \(optional\)$/).fill(note);
  await sheet.getByLabel(/I confirm the details above/).check();
  await sheet.getByRole("button", { name: /^Sign & send/ }).click();
  await expect(sheet).toHaveCount(0);
  // The page reloads its data after signing — slow on a busy machine.
  await expect(page.getByRole("group", { name: "Status" })).toHaveText(
    "Awaiting confirmation",
    { timeout: 30_000 },
  );
}
