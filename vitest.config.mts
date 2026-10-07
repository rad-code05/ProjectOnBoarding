import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Starting jsdom is slow on a busy Windows PC (70% of test time); 5 s
    // timed out on untouched tests. Real slowness would still show in CI.
    testTimeout: 15_000,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
  },
});
