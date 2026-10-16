import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ReportNav } from "./ReportNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/all-users",
}));

describe("ReportNav", () => {
  test("two groups; ready reports link, the others say Coming soon", () => {
    render(<ReportNav variant="page" />);
    expect(screen.getByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sign-off & compliance" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /All users list/ });
    expect(link).toHaveAttribute("href", "/reports/all-users");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("link", { name: /Signature log/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(6);
  });
});
