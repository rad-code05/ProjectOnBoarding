import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AiSettingsView } from "@/lib/admin/ai-shared";
import { AiSettingsForm } from "./AiSettingsForm";

const saveAiSettings = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  saveAiSettings: (input: unknown) => saveAiSettings(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const view: AiSettingsView = {
  enabled: true,
  model: 1,
  budget: 50,
  hourly: 30,
  models: [
    {
      id: 1,
      name: "Claude Sonnet 5.5",
      modelId: "claude-sonnet-5-5",
      note: "Balanced",
      priceIn: 2,
      priceOut: 10,
      active: true,
    },
    {
      id: 2,
      name: "Claude Opus 5.5",
      modelId: "claude-opus-5-5",
      note: null,
      priceIn: 4,
      priceOut: 20,
      active: true,
    },
    {
      id: 9,
      name: "Claude Sonnet 4.5",
      modelId: "claude-sonnet-4-5",
      note: null,
      priceIn: 3,
      priceOut: 15,
      active: false,
    },
  ],
  usage: { spent: 11.4, answers: 214, people: 3 },
  resetsOn: "1 Nov",
  lastChanged: "Raju Bholani · 22 Oct 2026",
};

describe("AiSettingsForm (board: Phone · Admin · AI settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveAiSettings.mockResolvedValue({ ok: true });
  });

  test("shows on / off, the active models, limits and usage", () => {
    render(<AiSettingsForm view={view} />);
    expect(
      screen.getByRole("switch", { name: "On for everyone" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Claude Sonnet 5\.5/ }),
    ).toBeChecked();
    // A retired model can't be chosen.
    expect(screen.queryByRole("radio", { name: /Sonnet 4\.5/ })).toBeNull();
    expect(screen.getByText("$11.40 of $50 · 23%")).toBeInTheDocument();
    expect(
      screen.getByText("214 questions by 3 people · resets 1 Nov"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Last changed by Raju Bholani · 22 Oct 2026"),
    ).toBeInTheDocument();
  });

  test("Save sends off, the model and the limits", async () => {
    const user = userEvent.setup();
    render(<AiSettingsForm view={view} />);
    await user.click(screen.getByRole("switch", { name: "On for everyone" }));
    expect(
      screen.getByRole("switch", { name: "Off for everyone" }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Claude Opus 5\.5/ }));
    const hourly = screen.getByLabelText("Questions per person / hour");
    await user.clear(hourly);
    await user.type(hourly, "40");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveAiSettings).toHaveBeenCalledWith({
        enabled: false,
        model: 2,
        budget: 50,
        hourly: 40,
      }),
    );
    expect(await screen.findByText("AI settings saved.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  test("a refused save says why", async () => {
    saveAiSettings.mockResolvedValue({
      ok: false,
      message: "Check the limits.",
    });
    const user = userEvent.setup();
    render(<AiSettingsForm view={view} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Check the limits.")).toBeInTheDocument();
  });
});
