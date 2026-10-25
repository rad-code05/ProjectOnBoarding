import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The API key and the model come from .env.local (never in CI by default).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * The custom report test set against the REAL model (F17a-6b): opt-in,
 * `pnpm test:ai-reports` — well under a dollar a run. Never part of
 * `pnpm test` or CI.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/ai-evals/**/*.eval.ts"],
    testTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
