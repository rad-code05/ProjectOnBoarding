import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  setEquipmentReturn,
  setMailboxHandling,
  setRemoval,
} from "@/app/(app)/requests/actions";
import type { Removals } from "@/lib/requests/offboarding";
import {
  EquipmentReturnSheet,
  MailboxChoice,
  WorkRemovalSections,
} from "./OffboardingWork";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/requests/actions", () => ({
  setRemoval: vi.fn(async () => ({ ok: true })),
  setEquipmentReturn: vi.fn(async () => ({ ok: true })),
  setMailboxHandling: vi.fn(async () => ({ ok: true })),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const removals: Removals = {
  apps: [
    {
      id: "a1",
      appId: 1,
      name: "Slack",
      category: "Core",
      had: "Member",
      method: "Delete",
      doneAt: "2026-10-01T08:05:00Z",
    },
    {
      id: "a2",
      appId: 1,
      name: "Figma",
      category: "Core",
      had: "Editor",
      method: null,
      doneAt: null,
    },
  ],
  equipment: [
    {
      id: "e1",
      name: "Laptop · macOS",
      assetTag: "LT-1",
      description: null,
      status: "pending",
      reason: null,
      recordedAt: null,
    },
  ],
  access: [
    {
      id: "p1",
      typeId: 1,
      name: "Office access",
      action: "Disable",
      scope: "Badge",
      doneAt: null,
    },
  ],
};
const noFlag = () => null;

describe("WorkRemovalSections", () => {
  beforeEach(() => vi.clearAllMocks());

  test("progress per section, time of each tick in the person's timezone", () => {
    render(
      <WorkRemovalSections
        removals={removals}
        editable
        timeZone="Asia/Dubai"
        flag={noFlag}
      />,
    );
    const apps = screen.getByRole("region", { name: "Applications to remove" });
    expect(within(apps).getByRole("status")).toHaveTextContent("1 of 2");
    expect(within(apps).getByText("Removed 12:05")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Physical & logical access" }),
    ).toHaveTextContent("0 of 1");
  });

  test("a tick needs a method first; choosing one records it", async () => {
    render(
      <WorkRemovalSections
        removals={removals}
        editable
        timeZone="Asia/Dubai"
        flag={noFlag}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /Figma/ })).toBeDisabled();
    const figma = screen.getByRole("group", { name: "How Figma is removed" });
    await userEvent.click(within(figma).getByText("Suspend"));
    expect(setRemoval).toHaveBeenCalledWith({
      kind: "application",
      itemId: "a2",
      done: null,
      method: "Suspend",
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("a ticked application keeps its method until it is unticked", async () => {
    render(
      <WorkRemovalSections
        removals={removals}
        editable
        timeZone="Asia/Dubai"
        flag={noFlag}
      />,
    );
    expect(
      screen.getByRole("group", { name: "How Slack is removed" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Slack/ }));
    expect(setRemoval).toHaveBeenCalledWith({
      kind: "application",
      itemId: "a1",
      done: false,
      method: null,
    });
  });

  test("ticking access", async () => {
    render(
      <WorkRemovalSections
        removals={removals}
        editable
        timeZone="Asia/Dubai"
        flag={noFlag}
      />,
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Office access/ }),
    );
    expect(setRemoval).toHaveBeenCalledWith({
      kind: "access",
      itemId: "p1",
      done: true,
      method: null,
    });
  });

  test("after Review & sign everything is read only", () => {
    render(
      <WorkRemovalSections
        removals={removals}
        editable={false}
        timeZone="Asia/Dubai"
        flag={noFlag}
      />,
    );
    for (const box of screen.getAllByRole("checkbox"))
      expect(box).toBeDisabled();
    expect(screen.getByRole("button", { name: /Laptop/ })).toBeDisabled();
  });
});

describe("EquipmentReturnSheet", () => {
  beforeEach(() => vi.clearAllMocks());

  test("Not returned needs a reason, then saves it", async () => {
    const onClose = vi.fn();
    render(
      <EquipmentReturnSheet item={removals.equipment[0]} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Not returned/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/What happened/),
      "Lost by the courier",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setEquipmentReturn).toHaveBeenCalledWith({
      itemId: "e1",
      status: "not_returned",
      reason: "Lost by the courier",
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("MailboxChoice", () => {
  test("records the choice", async () => {
    render(
      <MailboxChoice
        requestId="r1"
        handling={null}
        recordedAt={null}
        editable
        timeZone="Asia/Dubai"
      />,
    );
    await userEvent.click(
      screen.getByRole("radio", { name: /No mailbox to convert/ }),
    );
    expect(setMailboxHandling).toHaveBeenCalledWith({
      requestId: "r1",
      value: "no_mailbox",
    });
  });
});
