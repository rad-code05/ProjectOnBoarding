import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ReportNav } from "./ReportNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/all-users",
}));

describe("ReportNav", () => {
  test("two groups; every report is ready and links", () => {
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
      screen.getByRole("link", { name: /Open requests by status/ }),
    ).toHaveAttribute("href", "/reports/open-requests");
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});
