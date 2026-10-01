import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { PasswordField } from "./PasswordField";

test("password is hidden until the user chooses to show it", async () => {
  const user = userEvent.setup();
  render(<PasswordField label="Password" />);
  const input = screen.getByLabelText("Password");

  expect(input).toHaveAttribute("type", "password");

  const toggle = screen.getByRole("button", { name: "Show password" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  await user.click(toggle);

  expect(input).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the toggle can be reached with the keyboard after the input", async () => {
  const user = userEvent.setup();
  render(<PasswordField label="Password" />);

  await user.tab();
  expect(screen.getByLabelText("Password")).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
});
