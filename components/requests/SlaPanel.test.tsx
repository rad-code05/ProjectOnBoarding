import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { SlaPanel } from "./SlaPanel";

const base = {
  timeline: "within_24h" as const,
  cutoffDate: "2026-09-30",
  cutoffTime: "18:00",
  lastWorkingDay: "2026-09-30",
  companyTimezone: "Asia/Dubai",
  reason: "",
  onReasonChange: vi.fn(),
  disabled: false,
};

describe("SlaPanel", () => {
  test("while due: countdown, deadline in red, progress", () => {
    const dueAt = new Date(Date.now() + (6 * 60 + 12) * 60_000).toISOString();
    render(
      <SlaPanel
        {...base}
        dueAt={dueAt}
        sla={{ total: 10, done: 5, removedAt: null, met: null }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /^Due in 6h 1[12]m$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Remove all access by/)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Access removed" }),
    ).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByText(/5 of 10 removed/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Why was the SLA missed/),
    ).not.toBeInTheDocument();
  });

  test("met: the result, no reason needed", () => {
    render(
      <SlaPanel
        {...base}
        dueAt="2026-10-01T14:00:00.000Z"
        sla={{
          total: 3,
          done: 3,
          removedAt: "2026-10-01T10:12:00.000Z",
          met: true,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Removed in time" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
    expect(screen.getByText("1 Oct 2026, 14:12")).toBeInTheDocument();
  });

  test("missed: late by, and the reason is required", async () => {
    const onReasonChange = vi.fn();
    render(
      <SlaPanel
        {...base}
        onReasonChange={onReasonChange}
        dueAt="2026-10-01T14:00:00.000Z"
        sla={{
          total: 3,
          done: 3,
          removedAt: "2026-10-01T17:12:00.000Z",
          met: false,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Late by 3h 12m" }),
    ).toBeInTheDocument();
    const box = screen.getByLabelText(/Why was the SLA missed/);
    expect(box).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(box, "x");
    expect(onReasonChange).toHaveBeenCalledWith("x");
  });
});
