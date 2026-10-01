import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  test("is a real button with its label as the accessible name", () => {
    render(<Button>Sign in</Button>);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeInTheDocument();
    // Defaults to type="button" so it never submits a form by accident.
    expect(button).toHaveAttribute("type", "button");
  });

  test("calls onClick when clicked or activated with the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save draft</Button>);

    // Keyboard: Tab moves focus onto the button, Enter activates it.
    await user.tab();
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveFocus();
    await user.keyboard("{Enter}");
    // Mouse.
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test("is disabled and busy while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Sign in
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Sign in/ });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("can be a submit button", () => {
    render(<Button type="submit">Sign in</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
