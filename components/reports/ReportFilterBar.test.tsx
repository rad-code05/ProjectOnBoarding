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

/** Click an option in the open searchable list (not a <select>'s). */
const pick = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(screen.getByRole("listbox")).getByRole("option", { name }));

function show() {
  render(
    <ReportFilterBar
      filters={DEFAULT_REPORT_FILTERS}
      options={{
        departments: [
          { id: 2, name: "Sales" },
          { id: 3, name: "Design" },
        ],
        countries: ["CH", "DE"],
        offices: [
          {
            id: 1,
            name: "Dubai",
            country: "AE",
            usesRegions: false,
            active: true,
          },
          { id: 4, name: "US", country: "US", usesRegions: true, active: true },
        ],
        regions: [
          { id: 44, country: "US", name: "Texas" },
          { id: 10, country: "US", name: "Florida" },
        ],
        cities: [
          { id: 9, officeId: 4, regionId: 44, name: "Austin" },
          { id: 8, officeId: 4, regionId: 10, name: "Miami" },
        ],
        nationalities: ["CH", "IT"],
      }}
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
    await user.selectOptions(within(sheet).getByLabelText(/Country/), "CH");
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
        options={{ departments: [], countries: ["CH"] }}
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

  test("a today report: no period or type, its own search, the tab is kept", async () => {
    const user = userEvent.setup();
    count.mockResolvedValue(1);
    render(
      <ReportFilterBar
        filters={DEFAULT_REPORT_FILTERS}
        options={{ departments: [{ id: 2, name: "Sales" }], countries: ["CH"] }}
        count={count}
        noun="people"
        nounOne="person"
        types={false}
        periods={false}
        search="Name, email or item"
        keep={{ kind: "equipment" }}
        lead={<span>As of today</span>}
      />,
    );
    expect(screen.getByText("As of today")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove filter/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search name, email or item" }),
    ).toHaveAttribute("placeholder", "Name, email or item");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).queryByText("Period")).not.toBeInTheDocument();
    expect(
      within(sheet).queryByLabelText("Request type"),
    ).not.toBeInTheDocument();
    await user.selectOptions(within(sheet).getByLabelText("Department"), "2");
    await user.click(
      await within(sheet).findByRole("button", { name: "Show 1 person" }),
    );
    expect(replace).toHaveBeenCalledWith(
      "/reports/all-users?kind=equipment&department=2",
      { scroll: false },
    );
  });

  test("places: false leaves out country and department", async () => {
    const user = userEvent.setup();
    render(
      <ReportFilterBar
        filters={DEFAULT_REPORT_FILTERS}
        options={{ departments: [{ id: 2, name: "Sales" }], countries: ["CH"] }}
        count={count}
        periods={false}
        places={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByLabelText("Request type")).toBeInTheDocument();
    expect(within(sheet).queryByLabelText(/Country/)).not.toBeInTheDocument();
    expect(
      within(sheet).queryByLabelText("Department"),
    ).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Office")).not.toBeInTheDocument();
    expect(
      within(sheet).queryByLabelText("Nationality"),
    ).not.toBeInTheDocument();
  });

  test("office: US asks for a state, then lists that state's cities; nationality", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Filters · 1" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).queryByLabelText("State")).not.toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Office"), "US");
    await pick(user, "US");
    expect(within(sheet).getByLabelText("City")).toBeDisabled();
    await user.type(within(sheet).getByLabelText("State"), "tex");
    await pick(user, "Texas");
    await user.click(within(sheet).getByLabelText("City"));
    expect(
      within(within(sheet).getByRole("listbox"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Austin"]);
    await pick(user, "Austin");
    await user.type(within(sheet).getByLabelText("Nationality"), "swi");
    await pick(user, "Switzerland");
    await waitFor(() =>
      expect(count).toHaveBeenLastCalledWith(
        "office=4&state=44&city=9&nationality=CH",
      ),
    );
    await user.click(
      await within(sheet).findByRole("button", { name: "Show 27 requests" }),
    );
    expect(replace).toHaveBeenLastCalledWith(
      "/reports/all-users?office=4&state=44&city=9&nationality=CH",
      { scroll: false },
    );
  });

  test('"Not set" office and nationality; Dubai has no state', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Filters · 1" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await user.type(within(sheet).getByLabelText("Office"), "Dub");
    await pick(user, "Dubai");
    expect(within(sheet).queryByLabelText("State")).not.toBeInTheDocument();
    await user.click(within(sheet).getByLabelText("Office"));
    await user.clear(within(sheet).getByLabelText("Office"));
    await user.type(within(sheet).getByLabelText("Office"), "not");
    await pick(user, "Not set");
    await user.type(within(sheet).getByLabelText("Nationality"), "not");
    await pick(user, "Not set");
    await waitFor(() =>
      expect(count).toHaveBeenLastCalledWith("office=0&nationality=none"),
    );
  });
});
