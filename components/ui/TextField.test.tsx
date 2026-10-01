import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  test("the label is connected to the input", async () => {
    const user = userEvent.setup();
    render(<TextField label="Work email" type="email" />);
    const input = screen.getByLabelText("Work email");

    await user.type(input, "raju@laine.ai");
    expect(input).toHaveValue("raju@laine.ai");
  });

  test("an error marks the field invalid and is read out with it", () => {
    render(<TextField label="Manager" error="Required." />);
    const input = screen.getByLabelText("Manager");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Required.");
  });

  test("a hint is read out with the field", () => {
    render(<TextField label="Country" hint="Where the person works." />);
    expect(screen.getByLabelText("Country")).toHaveAccessibleDescription(
      "Where the person works.",
    );
  });

  test("required fields are marked required", () => {
    render(<TextField label="Last name" required />);
    expect(screen.getByLabelText(/Last name/)).toBeRequired();
  });

  test("read-only fields can't be typed into", async () => {
    const user = userEvent.setup();
    render(
      <TextField label="Ticket ID" readOnly defaultValue="UAM-2026-000124" />,
    );
    const input = screen.getByLabelText("Ticket ID");

    await user.type(input, "x");
    expect(input).toHaveValue("UAM-2026-000124");
  });
});
