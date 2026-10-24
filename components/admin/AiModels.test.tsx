import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminAiModel } from "@/lib/admin/ai-shared";
import { AiModels } from "./AiModels";

const saveAiModel = vi.fn();
const setAiModelActive = vi.fn();
const testAiModel = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  saveAiModel: (i: unknown) => saveAiModel(i),
  setAiModelActive: (id: number, a: boolean) => setAiModelActive(id, a),
  testAiModel: (i: unknown) => testAiModel(i),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const m = (id: number, name: string, active = true): AdminAiModel => ({
  id,
  name,
  modelId: name.toLowerCase().replace(/ /g, "-"),
  note: null,
  priceIn: 2,
  priceOut: 10,
  active,
});
const models = [
  m(1, "Claude Sonnet 5"),
  m(2, "Claude Haiku 4"),
  m(3, "Claude Old", false),
];

describe("AiModels (board: AI settings · models)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveAiModel.mockResolvedValue({ ok: true, id: 9 });
    setAiModelActive.mockResolvedValue({ ok: true });
    testAiModel.mockResolvedValue({ ok: true });
  });

  test("Edit and Retire; the one in use can't be retired; retired ones Restore", async () => {
    const user = userEvent.setup();
    render(<AiModels models={models} inUse={1} />);
    expect(
      screen.queryByRole("button", { name: "Retire Claude Sonnet 5" }),
    ).toBeNull();
    expect(screen.getByText("claude-sonnet-5 · in use")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Retire Claude Haiku 4" }),
    );
    await waitFor(() =>
      expect(setAiModelActive).toHaveBeenCalledWith(2, false),
    );
    await user.click(
      screen.getByRole("button", { name: "Restore Claude Old" }),
    );
    await waitFor(() => expect(setAiModelActive).toHaveBeenCalledWith(3, true));
    expect(refresh).toHaveBeenCalled();
  });

  test("Add a model: Test the model, then Add model", async () => {
    const user = userEvent.setup();
    render(<AiModels models={models} inUse={1} />);
    await user.click(screen.getByRole("button", { name: "Add a model" }));
    const sheet = screen.getByRole("dialog", { name: "Add a model" });
    await user.type(
      within(sheet).getByLabelText("Name shown to people"),
      "Claude Opus 6",
    );
    await user.type(within(sheet).getByLabelText(/Model ID/), "claude-opus-6");
    await user.type(within(sheet).getByLabelText(/Price in/), "4");
    await user.type(within(sheet).getByLabelText(/Price out/), "20");
    await user.click(
      within(sheet).getByRole("button", { name: "Test the model" }),
    );
    expect(
      await within(sheet).findByText("Anthropic answered — the ID works"),
    ).toBeInTheDocument();
    expect(testAiModel).toHaveBeenCalledWith({
      modelId: "claude-opus-6",
      id: null,
    });
    await user.click(within(sheet).getByRole("button", { name: "Add model" }));
    await waitFor(() =>
      expect(saveAiModel).toHaveBeenCalledWith({
        id: null,
        name: "Claude Opus 6",
        modelId: "claude-opus-6",
        note: null,
        priceIn: 4,
        priceOut: 20,
      }),
    );
  });

  test("a failed test says why", async () => {
    testAiModel.mockResolvedValue({
      ok: false,
      message:
        "Anthropic doesn't know this model ID — check it against their model list.",
    });
    const user = userEvent.setup();
    render(<AiModels models={models} inUse={1} />);
    await user.click(
      screen.getByRole("button", { name: "Edit Claude Haiku 4" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Edit a model" });
    await user.click(
      within(sheet).getByRole("button", { name: "Test the model" }),
    );
    expect(
      await within(sheet).findByText(/doesn't know this model ID/),
    ).toBeInTheDocument();
    expect(testAiModel).toHaveBeenCalledWith({
      modelId: "claude-haiku-4",
      id: 2,
    });
  });
});
