import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminPerson } from "@/lib/admin/users-shared";
import { UserSheet } from "./UserSheet";

const saveUserRoles = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/users/actions", () => ({
  saveUserRoles: (i: unknown) => saveUserRoles(i),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const raju: AdminPerson = {
  id: "user_raju",
  email: "raju@example.test",
  firstName: "Raju",
  lastName: "Bholani",
  roles: ["admin", "requester", "it_operator"],
  active: true,
  mfa: true,
  lastSignInAt: null,
};
const moises: AdminPerson = {
  ...raju,
  id: "user_moises",
  email: "moises@example.test",
  firstName: "Moises",
  lastName: "Larez",
  roles: ["approver"],
};
const aisha: AdminPerson = {
  ...raju,
  id: "user_aisha",
  email: "aisha@example.test",
  firstName: "Aisha",
  lastName: "Noor",
  roles: ["auditor"],
};
const people = [raju, moises, aisha];

const sheet = (person: AdminPerson) =>
  render(
    <UserSheet
      person={person}
      people={people}
      you="user_raju"
      meta="MFA on · never signed in"
      onClose={() => {}}
    />,
  );

describe("UserSheet (F18b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveUserRoles.mockResolvedValue({ ok: true });
  });

  test("gives a role and saves; Save waits for a change", async () => {
    const u = userEvent.setup();
    sheet(aisha);
    const save = screen.getByRole("button", { name: "Save roles" });
    expect(save).toBeDisabled();
    await u.click(screen.getByRole("checkbox", { name: /^Requester/ }));
    expect(save).toBeEnabled();
    await u.click(save);
    expect(saveUserRoles).toHaveBeenCalledWith({
      userId: "user_aisha",
      roles: ["auditor", "requester"],
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("the only active approver's role is locked on, with the reason", () => {
    sheet(moises);
    expect(screen.getByRole("checkbox", { name: /^Approver/ })).toBeDisabled();
    expect(
      screen.getByText("The only active approver — locked on."),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /^Auditor/ })).toBeEnabled();
  });

  test("your own row is read-only", () => {
    sheet(raju);
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toBeDisabled();
    }
    expect(screen.getByRole("note")).toHaveTextContent(
      "Nobody changes their own roles",
    );
    expect(screen.queryByRole("button", { name: "Save roles" })).toBeNull();
  });

  test("a refusal from the server is shown", async () => {
    const u = userEvent.setup();
    saveUserRoles.mockResolvedValue({
      ok: false,
      message: "At least one active approver must remain.",
    });
    sheet(aisha);
    await u.click(screen.getByRole("checkbox", { name: /^Admin/ }));
    await u.click(screen.getByRole("button", { name: "Save roles" }));
    expect(
      await screen.findByText("At least one active approver must remain."),
    ).toBeVisible();
  });
});
