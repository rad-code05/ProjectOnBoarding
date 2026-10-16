import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_REPORT_FILTERS } from "@/lib/reports/filters";
import { ReportFilterBar } from "./ReportFilterBar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/reports/all-users",
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const count = vi.fn();

function show() {
  render(
    <ReportFilterBar
      filters={DEFAULT_REPORT_FILTERS}
      departments={[
        { id: 2, name: "Sales" },
        { id: 3, name: "Design" },
      ]}
      countries={["CH", "DE"]}
      count={count}
    />,
  );
}

describe("ReportFilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    count.mockResolvedValue(27);
  });

  test("the period chip clears to all time", async () => {
    const user = userEvent.setup();
    show();
    await user.click(
      screen.getByRole("button", { name: "Remove filter: Last 12 months" }),
    );
    expect(replace).toHaveBeenCalledWith("/reports/all-users?period=all", {
      scroll: false,
    });
  });

  test("the sheet: period, type, country, department; Show N requests applies", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Filters · 1" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await user.click(within(sheet).getByRole("radio", { name: "3 months" }));
    await user.selectOptions(
      within(sheet).getByLabelText("Request type"),
      "onboarding",
    );
    await user.selectOptions(within(sheet).getByLabelText("Country"), "CH");
    await user.selectOptions(
      within(sheet).getByLabelText("Department"),
      "Sales",
    );
    await waitFor(() =>
      expect(count).toHaveBeenLastCalledWith(
        "period=3m&type=onboarding&country=CH&department=2",
      ),
    );
    await user.click(
      await within(sheet).findByRole("button", { name: "Show 27 requests" }),
    );
    expect(replace).toHaveBeenLastCalledWith(
      "/reports/all-users?period=3m&type=onboarding&country=CH&department=2",
      { scroll: false },
    );
  });

  test("a report of numbers has no search and no request type", async () => {
    const user = userEvent.setup();
    render(
      <ReportFilterBar
        filters={DEFAULT_REPORT_FILTERS}
        departments={[]}
        countries={["CH"]}
        count={count}
        noun="onboardings"
        counts
      />,
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters · 1" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(
      within(sheet).queryByLabelText("Request type"),
    ).not.toBeInTheDocument();
    expect(
      await within(sheet).findByRole("button", { name: "Show 27 onboardings" }),
    ).toBeInTheDocument();
  });
});
