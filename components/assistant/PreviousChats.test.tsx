import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PreviousChats } from "./PreviousChats";

const list = vi.fn();
const removeOne = vi.fn();
const removeAll = vi.fn();
vi.mock("./actions", () => ({
  listAssistantChats: () => list(),
  deleteAssistantChat: (id: string) => removeOne(id),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  deleteMyAssistantChats: () => removeAll(),
}));

const recent = new Date(Date.now() - 60_000).toISOString();
const chats = [
  { id: "a", title: "Who holds Slack today?", updatedAt: recent, messages: 6 },
  {
    id: "b",
    title: "What does Returned mean?",
    updatedAt: "2026-01-05T08:00:00Z",
    messages: 1,
  },
];

const props = () => ({
  currentId: "a",
  timeZone: "Asia/Dubai",
  onOpen: vi.fn(),
  onNewChat: vi.fn(),
  onBack: vi.fn(),
  onDeleted: vi.fn(),
});

describe("PreviousChats (board: Phone · Assistant · Previous chats)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(chats);
    removeOne.mockResolvedValue(true);
    removeAll.mockResolvedValue({ ok: true, deleted: 2 });
  });

  test("own chats grouped, the open one marked; tap to continue", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<PreviousChats {...p} />);
    expect(
      await screen.findByText("Who holds Slack today?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Older" })).toBeInTheDocument();
    expect(screen.getByText("Open now")).toBeInTheDocument();
    expect(screen.getByText(/1 message$/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /^What does Returned mean\?/ }),
    );
    expect(p.onOpen).toHaveBeenCalledWith("b");
  });

  test("delete one asks in the row; Keep changes nothing; Delete removes it", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<PreviousChats {...p} />);
    await user.click(
      await screen.findByRole("button", {
        name: "Delete “What does Returned mean?”",
      }),
    );
    const ask = screen.getByRole("alert");
    expect(ask).toHaveTextContent("Delete “What does Returned mean?”?");
    await user.click(within(ask).getByRole("button", { name: "Keep" }));
    expect(removeOne).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Delete “What does Returned mean?”" }),
    );
    await user.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(removeOne).toHaveBeenCalledWith("b"));
    await waitFor(() =>
      expect(screen.queryByText("What does Returned mean?")).toBeNull(),
    );
    expect(p.onDeleted).toHaveBeenCalledWith("b");
  });

  test("delete all asks first", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<PreviousChats {...p} />);
    await user.click(
      await screen.findByRole("button", { name: "Delete all my chats" }),
    );
    await user.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(removeAll).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No chats yet/)).toBeInTheDocument();
    expect(p.onDeleted).toHaveBeenCalledWith("all");
  });

  test("nothing yet", async () => {
    list.mockResolvedValue([]);
    render(<PreviousChats {...props()} />);
    expect(await screen.findByText(/No chats yet/)).toBeInTheDocument();
  });
});
