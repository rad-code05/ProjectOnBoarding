import { expect, test as setup } from "@playwright/test";
import { authFile } from "../../playwright.config";
import { signInAs } from "./sign-in";

const USERS = [
  { role: "admin", landing: /\/requests$/ },
  { role: "approver", landing: /\/approvals$/ },
] as const;

for (const user of USERS) {
  setup(`sign in as the test ${user.role}`, async ({ page }) => {
    setup.setTimeout(90_000); // may wait for a fresh authenticator code
    await signInAs(page, user.role);
    await page.goto("/");
    await expect(page).toHaveURL(user.landing);
    await page.context().storageState({ path: authFile(user.role) });
  });
}
