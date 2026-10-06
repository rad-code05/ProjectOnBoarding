import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatusPage } from "./StatusPage";

describe("StatusPage", () => {
  test("shows the message as a heading and a way back", () => {
    render(
      <StatusPage
        code="403"
        label="not allowed"
        title="You don't have access to this page"
        message="Contact Raju."
        action={{ href: "/", label: "Go to my start page" }}
      />,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "You don't have access to this page",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("403 · not allowed")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to my start page" }),
    ).toHaveAttribute("href", "/");
  });
});
