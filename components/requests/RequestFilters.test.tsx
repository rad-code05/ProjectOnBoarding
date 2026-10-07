import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RequestFilters } from "./RequestFilters";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/requests",
  useSearchParams: () => new URLSearchParams(search),
}));

describe("RequestFilters", () => {
  beforeEach(() => {
    replace.mockReset();
    search = "";
  });

  test("choosing a ticket type puts it in the URL", async () => {
    render(<RequestFilters countries={["CH", "DE"]} />);
    await userEvent
      .setup()
      .click(screen.getByRole("radio", { name: "Offboarding" }));
    expect(replace).toHaveBeenCalledWith("/requests?type=offboarding", {
      scroll: false,
    });
  });

  test("a new filter keeps the others and starts from the first page", async () => {
    search = "type=onboarding&limit=40";
    render(<RequestFilters countries={["CH", "DE"]} />);
    expect(screen.getByRole("radio", { name: "Onboarding" })).toBeChecked();
    await userEvent
      .setup()
      .selectOptions(screen.getByRole("combobox", { name: "Country" }), "DE");
    expect(replace).toHaveBeenCalledWith(
      "/requests?type=onboarding&country=DE",
      { scroll: false },
    );
  });

  test("country names come from the codes on requests", () => {
    render(<RequestFilters countries={["CH"]} />);
    expect(
      screen.getByRole("option", { name: "Switzerland" }),
    ).toBeInTheDocument();
  });

  test("search waits for a pause in typing", async () => {
    render(<RequestFilters countries={[]} />);
    await userEvent
      .setup()
      .type(
        screen.getByRole("searchbox", { name: "Search name, email or ticket" }),
        "anna",
      );
    expect(replace).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/requests?q=anna", {
        scroll: false,
      }),
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
