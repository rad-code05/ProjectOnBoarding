import { defineConfig, devices } from "@playwright/test";

// Locally the keys come from .env.local; in CI from GitHub secrets/variables.
// Variables already set in the environment win (CI points Supabase at its
// local database that way).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI) — fine.
}

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/** Signed-in browser state saved by auth.setup.ts, one file per test user. */
export const authFile = (role: "admin" | "approver") =>
  `playwright/.clerk/${role}.json`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A few browsers at a time and 10 s per check: browsers are slow when many
  // tests share one machine (the 5 s default timed out).
  workers: process.env.CI ? 2 : 4,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Gets a Clerk testing token once, before any browser starts.
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "signed-out", testMatch: /signed-out\.spec\.ts/ },
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: authFile("admin") },
    },
    {
      name: "approver",
      testMatch: /approver\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: authFile("approver") },
    },
    // Mobile-first (D22): phone SIZES in Chromium — the tests check layout,
    // menu and navigation at phone widths. iPhone 17e = narrowest iPhone.
    // Two test-only limits (real iPhones use real Safari on https):
    //   * WebKit drops Clerk's `__client_uat` cookie on http localhost;
    //   * a Safari user agent makes Clerk's dev instance take its Safari path,
    //     which a non-Safari browser can't complete — the saved session is
    //     lost once its token expires (8/8 failed vs 8/8 passed as Android).
    // So: iPhone size, touch and pixel density with an Android user agent.
    // Real Safari is checked by hand on the https preview.
    {
      name: "iphone",
      testMatch: /phone\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["iPhone 17e"],
        browserName: "chromium",
        userAgent: devices["Galaxy S24"].userAgent,
      },
    },
    {
      name: "galaxy-s24-ultra",
      testMatch: /phone\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Galaxy S24"],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 3.5,
      },
    },
  ],
  // Runs the production build (`pnpm build` first).
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
