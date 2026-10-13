import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearAccess,
  removeOther,
  saveEquipment,
  saveOther,
  setAccess,
  setPhysical,
} from "@/app/(app)/requests/actions";
import type { Removals } from "@/lib/requests/offboarding";
import { AddRemovalSheet, TakeOff, type RemovalEdit } from "./RemovalEditor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/requests/actions", () => ({
  setAccess: vi.fn(async () => ({ ok: true })),
  clearAccess: vi.fn(async () => ({ ok: true })),
  saveOther: vi.fn(async () => ({ ok: true, id: "o1" })),
  removeOther: vi.fn(async () => ({ ok: true })),
  saveEquipment: vi.fn(async () => ({ ok: true, id: "e9" })),
  removeEquipment: vi.fn(async () => ({ ok: true })),
  setPhysical: vi.fn(async () => ({ ok: true })),
  clearPhysical: vi.fn(async () => ({ ok: true })),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const edit: RemovalEdit = {
  requestId: "r1",
  catalog: [
    {
      id: 1,
      name: "Core business",
      apps: [
        {
          id: 10,
          name: "Slack",
          actions: ["Grant", "Modify", "Remove"],
          permissions: ["Member", "Admin"],
        },
        {
          id: 11,
          name: "Figma",
          actions: ["Grant", "Modify", "Remove"],
          permissions: ["Viewer", "Editor"],
        },
      ],
    },
  ],
  equipmentTypes: [
    {
      id: 2,
      name: "Laptop · macOS",
      actions: ["Issue", "Return"],
      needsDescription: false,
    },
  ],
  physicalTypes: [
    {
      id: 1,
      name: "Office access",
      actions: ["Grant", "Disable"],
      scopes: ["Badge", "Key"],
    },
    {
      id: 3,
      name: "Shared drives",
      actions: ["Grant", "Modify", "Remove"],
      scopes: ["Department"],
    },
  ],
};
const removals: Removals = {
  apps: [
    {
      id: "a1",
      appId: 10,
      name: "Slack",
      category: "Core business",
      had: "Member",
      method: null,
      doneAt: null,
    },
  ],
  equipment: [],
  access: [],
};

describe("AddRemovalSheet", () => {
  beforeEach(() => vi.clearAllMocks());

  test("an app not listed yet, with what they had, is added as Remove", async () => {
    const onClose = vi.fn();
    render(
      <AddRemovalSheet
        edit={edit}
        kind="app"
        removals={removals}
        onClose={onClose}
      />,
    );
    const select = screen.getByLabelText("Application");
    expect(
      screen.queryByRole("option", { name: /^Slack/ }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(select, "11");
    await userEvent.selectOptions(
      screen.getByLabelText(/What they had/),
      "Editor",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(setAccess).toHaveBeenCalledWith({
      requestId: "r1",
      appId: 11,
      action: "Remove",
      permission: "Editor",
      notes: null,
    });
    expect(onClose).toHaveBeenCalled();
  });

  test("an app that isn't in the catalog", async () => {
    render(
      <AddRemovalSheet
        edit={edit}
        kind="app"
        removals={removals}
        onClose={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Application"),
      "other",
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Application name"), "Old CRM");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(saveOther).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Old CRM", action: "Remove" }),
    );
  });

  test("equipment is added as Return; access as Disable or Remove", async () => {
    const { unmount } = render(
      <AddRemovalSheet
        edit={edit}
        kind="equipment"
        removals={removals}
        onClose={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Type"), "2");
    await userEvent.type(screen.getByLabelText("Asset tag"), "LT-9");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(saveEquipment).toHaveBeenCalledWith(
      expect.objectContaining({
        typeId: 2,
        action: "Return",
        assetTag: "LT-9",
      }),
    );
    unmount();

    render(
      <AddRemovalSheet
        edit={edit}
        kind="access"
        removals={removals}
        onClose={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Access"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(setPhysical).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: 3, action: "Remove" }),
    );
  });
});

describe("TakeOff", () => {
  beforeEach(() => vi.clearAllMocks());

  test("a catalog app is cleared by its app id, an Other app by its row", async () => {
    render(<TakeOff edit={edit} kind="app" row={removals.apps[0]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Take off Slack" }),
    );
    expect(clearAccess).toHaveBeenCalledWith({ requestId: "r1", appId: 10 });
    render(
      <TakeOff
        edit={edit}
        kind="app"
        row={{ ...removals.apps[0], id: "o1", appId: null, name: "Old CRM" }}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Take off Old CRM" }),
    );
    expect(removeOther).toHaveBeenCalledWith({ requestId: "r1", itemId: "o1" });
  });
});
