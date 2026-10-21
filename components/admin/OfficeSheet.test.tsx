import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  AdminCity,
  AdminOffice,
  AdminRegion,
} from "@/lib/admin/offices-shared";
import { OfficeSheet } from "./OfficeSheet";

const saveOffice = vi.fn();
const setOfficeActive = vi.fn();
const saveOfficeCity = vi.fn();
const setOfficeCityActive = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  saveOffice: (i: unknown) => saveOffice(i),
  setOfficeActive: (i: unknown) => setOfficeActive(i),
  saveOfficeCity: (i: unknown) => saveOfficeCity(i),
  setOfficeCityActive: (i: unknown) => setOfficeCityActive(i),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const regions: AdminRegion[] = [
  { id: 44, country: "US", name: "Texas" },
  { id: 10, country: "US", name: "Florida" },
];
const us: AdminOffice = {
  id: 4,
  name: "US",
  city: null,
  country: "US",
  usesRegions: true,
  active: true,
  uses: 9,
};
const cities: AdminCity[] = [
  { id: 1, officeId: 4, regionId: 44, name: "Austin", active: true, uses: 2 },
];

describe("OfficeSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [
      saveOffice,
      setOfficeActive,
      saveOfficeCity,
      setOfficeCityActive,
    ]) {
      fn.mockResolvedValue({ ok: true });
    }
  });

  test("adds an office; states only for a country that has them", async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OfficeSheet
        office={null}
        regions={regions}
        cities={[]}
        onClose={onClose}
      />,
    );
    await u.type(screen.getByLabelText("Office name"), "Riyadh");
    await u.type(screen.getByLabelText(/^City/), "Riyadh");
    await u.selectOptions(screen.getByLabelText("Country"), "SA");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(
      screen.getByText(/available for the United States only/),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Add office" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveOffice).toHaveBeenCalledWith({
      id: null,
      name: "Riyadh",
      city: "Riyadh",
      country: "SA",
      usesRegions: false,
    });
  });

  test("asks for a country first", async () => {
    const u = userEvent.setup();
    render(
      <OfficeSheet
        office={null}
        regions={regions}
        cities={[]}
        onClose={vi.fn()}
      />,
    );
    await u.type(screen.getByLabelText("Office name"), "Somewhere");
    await u.click(screen.getByRole("button", { name: "Add office" }));
    expect(
      screen.getByText("Choose the office's country."),
    ).toBeInTheDocument();
    expect(saveOffice).not.toHaveBeenCalled();
  });

  test("the US: cities per state, add one, retire one — the sheet stays open", async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OfficeSheet
        office={us}
        regions={regions}
        cities={cities}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Edit US" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Cities by state" });
    expect(list).toHaveTextContent("Texas");
    expect(list).toHaveTextContent("Austin");
    expect(list).toHaveTextContent("on 2 requests");

    await u.selectOptions(screen.getByLabelText("State of the new city"), "10");
    await u.type(screen.getByLabelText("New city"), "Miami");
    await u.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(saveOfficeCity).toHaveBeenCalledWith({
        id: null,
        officeId: 4,
        regionId: 10,
        name: "Miami",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("New city")).toHaveValue(""),
    );

    await u.click(
      within(list).getByRole("button", { name: "Retire Austin, Texas" }),
    );
    await waitFor(() =>
      expect(setOfficeCityActive).toHaveBeenCalledWith({
        id: 1,
        active: false,
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  }, 15_000); // types several words key by key — slow on a busy machine

  test("a city needs a state and a name", async () => {
    const u = userEvent.setup();
    render(
      <OfficeSheet
        office={us}
        regions={regions}
        cities={cities}
        onClose={vi.fn()}
      />,
    );
    await u.type(screen.getByLabelText("New city"), "Miami");
    await u.click(screen.getByRole("button", { name: "Add" }));
    expect(
      await screen.findByText("Choose a state and type the city."),
    ).toBeInTheDocument();
    expect(saveOfficeCity).not.toHaveBeenCalled();
  });

  test("retires the office; a database refusal is shown", async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OfficeSheet
        office={us}
        regions={regions}
        cities={cities}
        onClose={onClose}
      />,
    );
    await u.click(screen.getByRole("button", { name: "Retire office" }));
    await waitFor(() =>
      expect(setOfficeActive).toHaveBeenCalledWith({ id: 4, active: false }),
    );
    expect(onClose).toHaveBeenCalled();

    saveOffice.mockResolvedValueOnce({
      ok: false,
      message: "An office called Dubai already exists.",
    });
    const second = render(
      <OfficeSheet
        office={us}
        regions={regions}
        cities={cities}
        onClose={vi.fn()}
      />,
    );
    const name = within(second.container.ownerDocument.body).getAllByLabelText(
      "Office name",
    );
    await u.clear(name[name.length - 1]);
    await u.type(name[name.length - 1], "Dubai");
    const saves = screen.getAllByRole("button", { name: "Save changes" });
    await u.click(saves[saves.length - 1]);
    expect(
      await screen.findByText("An office called Dubai already exists."),
    ).toBeInTheDocument();
  });
});
