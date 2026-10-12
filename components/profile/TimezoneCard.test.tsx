import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TimezoneCard } from "./TimezoneCard";

const setMyTimezone = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/profile/actions", () => ({
  setMyTimezone: (input: unknown) => setMyTimezone(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("TimezoneCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMyTimezone.mockResolvedValue({ ok: true });
  });

  test("starts on the company default and explains what it changes", () => {
    render(<TimezoneCard own={null} company="Asia/Dubai" />);
    const select = screen.getByLabelText("Show times on my screens in");
    expect(select).toHaveValue("");
    expect(select).toHaveAccessibleDescription(/Only your screens change/);
    expect(
      screen.getByRole("option", { name: "Company default — Asia/Dubai" }),
    ).toBeInTheDocument();
  });

  test("choosing a timezone saves it at once and refreshes the page", async () => {
    render(<TimezoneCard own={null} company="Asia/Dubai" />);
    await userEvent.selectOptions(
      screen.getByLabelText("Show times on my screens in"),
      "Europe/Zurich",
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /^Saved · now \d\d:\d\d in Europe\/Zurich$/,
      ),
    );
    expect(setMyTimezone).toHaveBeenCalledWith({ timezone: "Europe/Zurich" });
    expect(refresh).toHaveBeenCalled();
  });

  test("Company default clears my own choice", async () => {
    render(<TimezoneCard own="Europe/Zurich" company="Asia/Dubai" />);
    await userEvent.selectOptions(
      screen.getByLabelText("Show times on my screens in"),
      "",
    );
    await waitFor(() =>
      expect(setMyTimezone).toHaveBeenCalledWith({ timezone: null }),
    );
  });

  test("a refusal puts the previous choice back and says why", async () => {
    setMyTimezone.mockResolvedValue({
      ok: false,
      message: "That timezone isn't known. Choose another one.",
    });
    render(<TimezoneCard own="Europe/Zurich" company="Asia/Dubai" />);
    const select = screen.getByLabelText("Show times on my screens in");
    await userEvent.selectOptions(select, "Europe/London");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That timezone isn't known",
    );
    expect(select).toHaveValue("Europe/Zurich");
  });
});
