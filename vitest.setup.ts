// Adds readable DOM matchers: toBeInTheDocument(), toHaveAttribute(), toHaveFocus(), …
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components after each test so tests don't affect each other.
afterEach(() => {
  cleanup();
});
