import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { IconButton } from "./IconButton";
import { SignOutIcon } from "./icons";

test("icon-only button gets its accessible name from label", () => {
  render(<IconButton label="Sign out" icon={<SignOutIcon />} />);
  const button = screen.getByRole("button", { name: "Sign out" });
  expect(button).toBeInTheDocument();
  // The icon itself is hidden from screen readers.
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
