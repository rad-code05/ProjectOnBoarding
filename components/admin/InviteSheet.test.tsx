import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminInvitation } from "@/lib/admin/users-shared";
import { invitationLine } from "@/lib/admin/users-shared";
import { InvitationList } from "./InvitationList";
import { InviteSheet } from "./InviteSheet";

const inviteUser = vi.fn();
const resendInvitation = vi.fn();
const withdrawInvitation = vi.fn();
const invitationLink = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/users/actions", () => ({
  inviteUser: (i: unknown) => inviteUser(i),
  resendInvitation: (i: unknown) => resendInvitation(i),
  withdrawInvitation: (i: unknown) => withdrawInvitation(i),
  invitationLink: (i: unknown) => invitationLink(i),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const celine: AdminInvitation = {
  id: "6f9619ff-8b86-4011-b42d-00c04fc964ff",
  email: "celine@example.test",
  firstName: "Celine",
  lastName: "Example",
  roles: ["auditor", "approver"],
  invitedBy: "Raju Bholani",
  createdAt: "2026-10-30T06:12:00Z",
  expiresAt: "2026-11-06T06:12:00Z",
};

describe("Invitations (F18c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [inviteUser, resendInvitation, withdrawInvitation]) {
      fn.mockResolvedValue({ ok: true });
    }
  });

  test("the invitation line says when it expires — or that it did", () => {
    const now = new Date("2026-11-01T00:00:00Z").getTime();
    expect(
      invitationLine(celine, "30 Oct 2026, 10:12", "6 Nov 2026", now),
    ).toBe("Sent 30 Oct 2026, 10:12 by Raju Bholani · expires 6 Nov 2026");
    expect(
      invitationLine(
        celine,
        "30 Oct 2026, 10:12",
        "6 Nov 2026",
        new Date("2026-11-07T00:00:00Z").getTime(),
      ),
    ).toBe(
      "Sent 30 Oct 2026, 10:12 by Raju Bholani · expired 6 Nov 2026 — send it again",
    );
  });

  test("invite: a role is needed; then name, email and roles are sent", async () => {
    const u = userEvent.setup();
    const onSent = vi.fn();
    const onClose = vi.fn();
    render(<InviteSheet onClose={onClose} onSent={onSent} />);
    await u.type(screen.getByLabelText("First name"), "Celine");
    await u.type(screen.getByLabelText("Last name"), "Example");
    await u.type(screen.getByLabelText("Work email"), "Celine@Example.test");
    await u.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Choose at least one role.")).toBeVisible();
    expect(inviteUser).not.toHaveBeenCalled();

    await u.click(screen.getByRole("checkbox", { name: /^Approver/ }));
    await u.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(inviteUser).toHaveBeenCalledWith({
      email: "Celine@Example.test",
      firstName: "Celine",
      lastName: "Example",
      roles: ["approver"],
    });
    expect(onSent).toHaveBeenCalledWith("celine@example.test");
    expect(onClose).toHaveBeenCalled();
  });

  test("a refusal stays in the sheet", async () => {
    const u = userEvent.setup();
    inviteUser.mockResolvedValue({
      ok: false,
      message:
        "Celine@example.test is already invited — send it again instead.",
    });
    const onClose = vi.fn();
    render(<InviteSheet onClose={onClose} onSent={() => {}} />);
    await u.click(screen.getByRole("checkbox", { name: /^Auditor/ }));
    await u.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/already invited/)).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("send again, and withdraw only after a second click", async () => {
    const u = userEvent.setup();
    render(
      <InvitationList
        invitations={[celine]}
        lines={{ [celine.id]: "Sent …" }}
      />,
    );
    expect(
      screen.getByText("celine@example.test · Approver, Auditor"),
    ).toBeVisible();
    await u.click(screen.getByRole("button", { name: "Send again" }));
    expect(resendInvitation).toHaveBeenCalledWith({ id: celine.id });
    expect(
      await screen.findByText("✓ Sent again to celine@example.test."),
    ).toBeVisible();

    await u.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(withdrawInvitation).not.toHaveBeenCalled();
    await u.click(
      screen.getByRole("button", { name: "Withdraw — the link stops working" }),
    );
    expect(withdrawInvitation).toHaveBeenCalledWith({ id: celine.id });
  });

  test("copy the link: asked from the server, put on the clipboard", async () => {
    const u = userEvent.setup();
    invitationLink.mockResolvedValue({
      ok: true,
      url: "https://clerk.example/inv",
    });
    render(<InvitationList invitations={[celine]} lines={{}} />);
    await u.click(screen.getByRole("button", { name: "Copy invitation link" }));
    expect(
      await screen.findByText(
        "✓ Link copied — it only works for celine@example.test.",
      ),
    ).toBeVisible();
    await expect(navigator.clipboard.readText()).resolves.toBe(
      "https://clerk.example/inv",
    );
  });
});
