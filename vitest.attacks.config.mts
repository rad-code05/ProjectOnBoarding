import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The API key and the model come from .env.local (never in CI by default).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * Attack tests against the REAL model (F15e-3): opt-in, they cost a few
 * cents — `pnpm test:ai-attacks`. Never part of `pnpm test` or CI.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/ai-attacks/**/*.attack.ts"],
    testTimeout: 90_000,
    // One question at a time: the answers are easier to read, and gentle on
    // the rate limit.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
