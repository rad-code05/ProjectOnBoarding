import { expect, type Page } from "@playwright/test";
import { openApp } from "./open";

/** Makes sure the signed-in person has an active signature (typed initials). */
export async function saveInitials(page: Page) {
  await openApp(page, "/profile");
  await page
    .getByLabel("Initials (up to 4 characters)")
    .fill(`T${Date.now() % 1000}`.slice(0, 4));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("radio", { name: /Initials/ })).toBeChecked();
}

/**
 * As Raju: a fresh request with every required field, executed (section 9
 * ticked). Returns its ticket ID; the page stays on the request.
 */
export async function createExecutedRequest(page: Page, firstName: string) {
  await openApp(page, "/requests");
  await page.getByRole("button", { name: "New request" }).first().click();
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
  await expect(page.getByRole("status").first()).toHaveText(/^Saved/);

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

/** As Raju, on the request page: Review & sign → I confirm → Sign & send. */
export async function reviewAndSign(page: Page) {
  await page
    .getByRole("button", { name: "Review & sign", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Review & sign" });
  await sheet.getByLabel(/I confirm the details above/).check();
  await sheet.getByRole("button", { name: /^Sign & send/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Status" })).toHaveText(
    "Awaiting confirmation",
  );
}
