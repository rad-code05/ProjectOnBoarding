import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createDraft, startOffboarding } from "@/app/(app)/requests/actions";
import type { Leaver } from "@/lib/requests/leavers-shared";
import { NewRequestSheet } from "./NewRequestSheet";

vi.mock("@/app/(app)/requests/actions", () => ({
  createDraft: vi.fn(async () => undefined),
  startOffboarding: vi.fn(async () => ({
    ok: false,
    message:
      "An offboarding is already open for this person — find it in the Requests list.",
  })),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const leavers: Leaver[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Marco Rossi",
    email: "marco.rossi@laine.ai",
    detail: "Sales · Italy",
    items: 11,
    since: "UAM-2026-000098",
    openTicket: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Omar Haddad",
    email: "omar.haddad@laine.ai",
    detail: "Operations",
    items: 4,
    since: "UAM-2026-000101",
    openTicket: "UAM-2026-000131",
  },
];

describe("NewRequestSheet", () => {
  beforeEach(() => vi.clearAllMocks());

  test("onboarding is the default and starts a draft", async () => {
    render(<NewRequestSheet leavers={leavers} onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "New onboarding" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Start onboarding" }),
    );
    expect(createDraft).toHaveBeenCalledOnce();
  });

  test("offboarding: find the person, pick them, offboard", async () => {
    render(<NewRequestSheet leavers={leavers} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Offboarding" }));
    expect(
      screen.getByRole("heading", { name: "Who is leaving?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offboard" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Find the person"), "rossi");
    expect(screen.queryByText("Omar Haddad")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Marco Rossi/ }));
    expect(
      screen.getByText("11 items on record · since UAM-2026-000098"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Offboard Marco" }),
    );
    expect(startOffboarding).toHaveBeenCalledWith({
      employeeId: leavers[0].id,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("already open");
  });

  test("someone with an open offboarding can't be picked", async () => {
    render(<NewRequestSheet leavers={leavers} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Offboarding" }));
    expect(screen.getByRole("radio", { name: /Omar Haddad/ })).toBeDisabled();
    expect(
      screen.getByText("Offboarding already open · UAM-2026-000131"),
    ).toBeInTheDocument();
  });

  test("someone not in the app: an empty offboarding", async () => {
    render(<NewRequestSheet leavers={[]} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Offboarding" }));
    expect(
      screen.getByText(/Nobody has access on record yet/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Start an empty offboarding" }),
    );
    expect(startOffboarding).toHaveBeenCalledWith({ employeeId: null });
  });
});
