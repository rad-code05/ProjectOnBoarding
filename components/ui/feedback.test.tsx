import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Avatar, initials } from "./Avatar";
import { InlineError } from "./InlineError";
import { Logo } from "./Logo";
import { Notice } from "./Notice";

describe("InlineError", () => {
  test("shows the message, and announces it when live", () => {
    render(<InlineError live>Email or password is incorrect.</InlineError>);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
  });
});

describe("Notice", () => {
  test("info notice shows its text", () => {
    render(<Notice>Access is by invitation only.</Notice>);
    expect(
      screen.getByText("Access is by invitation only."),
    ).toBeInTheDocument();
  });

  test("AI notice is labelled AI so it's never colour alone", () => {
    render(<Notice tone="ai">9 values suggested.</Notice>);
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("9 values suggested.")).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  test.each([
    ["Raju Bholani", "RB"],
    ["Moises Larez", "ML"],
    ["Moises", "M"],
    ["  anna   maria keller ", "AK"],
    ["", ""],
  ])("initials(%j) = %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  test("has the person's name as its accessible name", () => {
    render(<Avatar name="Raju Bholani" />);
    expect(screen.getByRole("img", { name: "Raju Bholani" })).toHaveTextContent(
      "RB",
    );
  });

  test("is hidden from screen readers when decorative", () => {
    render(<Avatar name="Raju Bholani" decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("Logo", () => {
  test("has alt text", () => {
    render(<Logo />);
    expect(screen.getByAltText("Laine")).toBeInTheDocument();
  });
});
