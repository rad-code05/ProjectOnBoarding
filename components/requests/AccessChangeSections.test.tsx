import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { keepHeld, setHeldChange } from "@/app/(app)/requests/actions";
import type { HeldItem } from "@/lib/requests/access-change";
import { HeldSection, InventoryNote } from "./AccessChangeSections";

vi.mock("@/app/(app)/requests/actions", () => ({
  setHeldChange: vi.fn(async () => ({ ok: true })),
  keepHeld: vi.fn(async () => ({ ok: true })),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const REQUEST = "0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b";
const item = (over: Partial<HeldItem>): HeldItem => ({
  inventoryId: "11111111-1111-4111-8111-111111111111",
  kind: "application",
  catalogId: 8,
  name: "Figma",
  category: "Core business",
  current: "Dev",
  assetTag: null,
  description: null,
  grantedTicket: "UAM-2026-000101",
  grantedAt: "2026-10-01T08:00:00Z",
  options: ["View", "Dev", "Full"],
  multiple: false,
  changeAction: "Modify",
  removeAction: "Remove",
  change: null,
  ...over,
});
const laptop = item({
  inventoryId: "22222222-2222-4222-8222-222222222222",
  kind: "equipment",
  catalogId: 1,
  name: "Laptop · macOS",
  category: null,
  current: null,
  assetTag: "LN-0042",
  options: [],
  changeAction: null,
  removeAction: "Return",
});

function Harness({ initial }: { initial: HeldItem[] }) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <HeldSection
        requestId={REQUEST}
        kind="application"
        firstName="Anna"
        items={items}
        onItemsChange={setItems}
        disabled={false}
      />
      <HeldSection
        requestId={REQUEST}
        kind="equipment"
        firstName="Anna"
        items={items}
        onItemsChange={setItems}
        disabled={false}
      />
    </>
  );
}

describe("access change rows", () => {
  beforeEach(() => vi.clearAllMocks());

  test("the note says what they hold and that everything is kept", () => {
    render(<InventoryNote firstName="Anna" held={[item({}), laptop]} />);
    expect(screen.getByText(/What Anna has today, from the/)).toHaveTextContent(
      "What Anna has today, from the access inventory: 1 application, 1 device. Everything is kept unless you change or remove it.",
    );
  });

  test("every row starts as Keep; a device offers Keep / Return only", () => {
    render(<Harness initial={[item({}), laptop]} />);
    const keeps = screen.getAllByRole("radio", { name: "Keep" });
    expect(keeps).toHaveLength(2);
    for (const keep of keeps) expect(keep).toBeChecked();
    const device = screen.getByRole("group", {
      name: "Laptop · macOS: keep, return",
    });
    expect(device).toHaveTextContent("KeepReturn");
    expect(screen.getAllByText("1 kept")).toHaveLength(2);
  });

  test("Remove saves at once and says what they had", async () => {
    render(<Harness initial={[item({})]} />);
    await userEvent.click(screen.getByRole("radio", { name: "Remove" }));
    expect(setHeldChange).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: REQUEST,
        kind: "application",
        action: "Remove",
      }),
    );
    expect(screen.getByText("Will be removed")).toBeInTheDocument();
    expect(screen.getByText(/^Had Dev · removed when/)).toBeInTheDocument();
  });

  test("Change opens the sheet: today's permission can't be picked again", async () => {
    render(<Harness initial={[item({})]} />);
    await userEvent.click(screen.getByRole("radio", { name: "Change" }));
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent("Anna has today");
    await userEvent.click(screen.getByRole("radio", { name: "Dev · today" }));
    expect(screen.getByRole("button", { name: "Save change" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Full" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Change to Full" }),
    );
    expect(setHeldChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Modify", value: "Full" }),
    );
    expect(screen.getByText("Dev → Full")).toBeInTheDocument();
  });

  test("Keep removes the line", async () => {
    render(
      <Harness
        initial={[
          item({
            change: {
              itemId: "x",
              action: "Modify",
              value: "Full",
              notes: null,
            },
          }),
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Keep" }));
    expect(keepHeld).toHaveBeenCalledWith({
      requestId: REQUEST,
      kind: "application",
      inventoryId: "11111111-1111-4111-8111-111111111111",
    });
    expect(screen.getByText("Dev")).toBeInTheDocument();
  });

  test("a refusal is shown and the row goes back", async () => {
    vi.mocked(setHeldChange).mockResolvedValueOnce({
      ok: false,
      message:
        "That item is not held by this person any more — reload the request.",
    });
    render(<Harness initial={[item({})]} />);
    await userEvent.click(screen.getByRole("radio", { name: "Remove" }));
    expect(
      await screen.findByText(/not held by this person any more/),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Keep" })).toBeChecked();
  });
});
