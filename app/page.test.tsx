import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("home page shows the app name as the main heading", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Laine onboarding rights" }),
  ).toBeDefined();
});
