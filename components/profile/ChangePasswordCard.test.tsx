import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ChangePasswordCard } from "./ChangePasswordCard";
import { checkNewPassword } from "./securityErrors";

// A fake Clerk user, so tests never talk to Clerk. useReverification passes
// the action straight through (no reverification needed in these tests).
const user = { updatePassword: vi.fn() };
const recordSecurityChange = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user }),
  useSession: () => ({ session: null }),
  useReverification: (fn: unknown) => fn,
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isReverificationCancelledError: () => false,
}));
vi.mock("@/app/(app)/profile/security/actions", () => ({
  recordSecurityChange: (...args: unknown[]) => recordSecurityChange(...args),
}));

async function fill(current: string, next: string, repeat: string) {
  const u = userEvent.setup();
  if (current) await u.type(screen.getByLabelText("Current password"), current);
  if (next) await u.type(screen.getByLabelText("New password"), next);
  if (repeat)
    await u.type(screen.getByLabelText("Repeat new password"), repeat);
  await u.click(screen.getByRole("button", { name: "Change password" }));
}

describe("checkNewPassword", () => {
  test.each([
    [{ current: "", next: "", repeat: "" }, "Fill in all three fields."],
    [
      { current: "old-pass-1", next: "short", repeat: "short" },
      "The new password needs at least 8 characters.",
    ],
    [
      { current: "old-pass-1", next: "new-pass-1", repeat: "new-pass-2" },
      "The new passwords don't match.",
    ],
    [
      { current: "same-pass-1", next: "same-pass-1", repeat: "same-pass-1" },
      "Choose a password that is different from your current one.",
    ],
    [{ current: "old-pass-1", next: "new-pass-1", repeat: "new-pass-1" }, null],
  ])("%o → %s", (fields, message) => {
    expect(checkNewPassword(fields)).toBe(message);
  });
});

describe("ChangePasswordCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.updatePassword.mockResolvedValue({});
    recordSecurityChange.mockResolvedValue({ ok: true });
  });

  test("has three labelled password fields with the right autocomplete", () => {
    render(<ChangePasswordCard />);
    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    for (const label of ["New password", "Repeat new password"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        "autocomplete",
        "new-password",
      );
    }
  });

  test("mismatched passwords are caught before anything goes to Clerk", async () => {
    render(<ChangePasswordCard />);
    await fill("old-pass-1", "new-pass-1", "new-pass-2");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The new passwords don't match.",
    );
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  test("changes the password, signs out other devices and records it", async () => {
    render(<ChangePasswordCard />);
    await fill("old-pass-1", "new-pass-1", "new-pass-1");
    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: "old-pass-1",
      newPassword: "new-pass-1",
      signOutOfOtherSessions: true,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password changed. Other devices were signed out.",
    );
    expect(recordSecurityChange).toHaveBeenCalledWith("password_changed");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  test("a wrong current password is said plainly and nothing is recorded", async () => {
    user.updatePassword.mockRejectedValue({
      errors: [{ code: "form_password_incorrect" }],
    });
    render(<ChangePasswordCard />);
    await fill("wrong-pass", "new-pass-1", "new-pass-1");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That password isn't right.",
    );
    expect(recordSecurityChange).not.toHaveBeenCalled();
  });
});
