import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { topRequestTypes } from "@/lib/profile/assistant-memory-shared";
import { AssistantMemoryCard } from "./AssistantMemoryCard";

const forget = vi.fn();
const deleteChats = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/profile/actions", () => ({
  forgetMyAssistantMemory: () => forget(),
  deleteMyAssistantChats: () => deleteChats(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const memory = {
  callMe: "Raj",
  reports: ["Signature log", "Access by application"],
  questions: ["Who has Admin rights in any application?"],
  requestTypes: ["Onboarding", "Offboarding"],
};

describe("AssistantMemoryCard (board: My profile · what the assistant remembers)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forget.mockResolvedValue({ ok: true });
    deleteChats.mockResolvedValue({ ok: true, deleted: 3 });
  });

  test("shows what it remembers", () => {
    render(<AssistantMemoryCard memory={memory} />);
    expect(
      screen.getByRole("heading", { name: "What the assistant remembers" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Raj")).toBeInTheDocument();
    expect(screen.getByText("Signature log")).toBeInTheDocument();
    expect(
      screen.getByText("Who has Admin rights in any application?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Onboarding · Offboarding")).toBeInTheDocument();
  });

  test("nothing yet", () => {
    render(
      <AssistantMemoryCard
        memory={{ callMe: null, reports: [], questions: [], requestTypes: [] }}
      />,
    );
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });

  test("Clear my memory asks first; Keep changes nothing", async () => {
    const user = userEvent.setup();
    render(<AssistantMemoryCard memory={memory} />);
    await user.click(screen.getByRole("button", { name: "Clear my memory" }));
    expect(
      screen.getByRole("dialog", { name: "Clear my memory?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(forget).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear my memory" }));
    const dialog = screen.getByRole("dialog", { name: "Clear my memory?" });
    await user.click(
      within(dialog).getByRole("button", { name: "Clear my memory" }),
    );
    await waitFor(() => expect(forget).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalled();
  });

  test("Delete my chats says how many went and forgets the open chat", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("laine.assistant.chat", "old-chat");
    render(<AssistantMemoryCard memory={memory} />);
    await user.click(screen.getByRole("button", { name: "Delete my chats" }));
    const dialog = screen.getByRole("dialog", { name: "Delete my chats?" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete my chats" }),
    );
    expect(await screen.findByText("3 chats deleted.")).toBeInTheDocument();
    expect(window.localStorage.getItem("laine.assistant.chat")).toBeNull();
  });
});

describe("topRequestTypes", () => {
  test("most started first, never-started left out", () => {
    expect(
      topRequestTypes(["offboarding", "onboarding", "offboarding"]),
    ).toEqual(["Offboarding", "Onboarding"]);
    expect(topRequestTypes([])).toEqual([]);
  });
});
