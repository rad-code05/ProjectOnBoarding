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
      screen.getByRole("link", { name: /Offboarding SLA/ }),
    ).toHaveAttribute("href", "/reports/offboarding-sla");
    expect(
      screen.queryByRole("link", { name: /Open requests by status/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Coming soon")).toHaveLength(1);
  });
});
