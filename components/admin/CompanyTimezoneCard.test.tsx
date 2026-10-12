import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CompanyTimezoneCard } from "./CompanyTimezoneCard";

const setCompanyTimezone = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  setCompanyTimezone: (input: unknown) => setCompanyTimezone(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("CompanyTimezoneCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCompanyTimezone.mockResolvedValue({ ok: true });
  });

  test("shows the company timezone, what it controls and who changed it", () => {
    render(
      <CompanyTimezoneCard
        timezone="Asia/Dubai"
        lastChanged="Raju Bholani · 11 Oct 2026"
      />,
    );
    const select = screen.getByLabelText("Timezone");
    expect(select).toHaveValue("Asia/Dubai");
    expect(select).toHaveAccessibleDescription(/every new PDF record/);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Last changed by Raju Bholani · 11 Oct 2026",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("Save sends the new timezone and refreshes", async () => {
    render(<CompanyTimezoneCard timezone="Asia/Dubai" lastChanged={null} />);
    await userEvent.selectOptions(
      screen.getByLabelText("Timezone"),
      "Europe/Zurich",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Saved · the company timezone is now Europe/Zurich",
      ),
    );
    expect(setCompanyTimezone).toHaveBeenCalledWith({
      timezone: "Europe/Zurich",
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("a refusal is shown", async () => {
    setCompanyTimezone.mockResolvedValue({
      ok: false,
      message: "Only an admin changes the company timezone.",
    });
    render(<CompanyTimezoneCard timezone="Asia/Dubai" lastChanged={null} />);
    await userEvent.selectOptions(
      screen.getByLabelText("Timezone"),
      "Europe/London",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only an admin changes the company timezone.",
    );
  });
});
