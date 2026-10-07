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
  ],
  // Runs the production build (`pnpm build` first).
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
