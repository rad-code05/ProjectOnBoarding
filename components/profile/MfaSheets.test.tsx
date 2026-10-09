import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { NewBackupCodesSheet } from "./NewBackupCodesSheet";
import { NewPhoneSheet } from "./NewPhoneSheet";

// A fake Clerk user, so tests never talk to Clerk. useReverification passes
// the action straight through (no reverification needed in these tests).
const user = {
  totpEnabled: true,
  primaryEmailAddress: { emailAddress: "raju@laine.ai" },
  disableTOTP: vi.fn(),
  createTOTP: vi.fn(),
  verifyTOTP: vi.fn(),
  createBackupCode: vi.fn(),
};
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

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  user.totpEnabled = true;
  user.disableTOTP.mockResolvedValue({});
  user.createTOTP.mockResolvedValue({
    uri: "otpauth://totp/Laine:raju?secret=ABC",
    secret: "ABC",
  });
  user.verifyTOTP.mockResolvedValue({ backupCodes: ["aaaa1111", "bbbb2222"] });
  user.createBackupCode.mockResolvedValue({ codes: ["cccc3333", "dddd4444"] });
  recordSecurityChange.mockResolvedValue({ ok: true });
});

describe("NewPhoneSheet", () => {
  test("removes the old authenticator, verifies the new one, shows new codes", async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(<NewPhoneSheet onClose={onClose} />);

    await u.click(screen.getByRole("button", { name: "Start" }));
    expect(user.disableTOTP).toHaveBeenCalledOnce();
    expect(user.createTOTP).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("img", { name: "QR code for your authenticator app" }),
    ).toBeInTheDocument();

    await u.type(screen.getByLabelText(/6-digit code/), "123456");
    await u.click(screen.getByRole("button", { name: "Verify" }));
    expect(user.verifyTOTP).toHaveBeenCalledWith({ code: "123456" });
    expect(recordSecurityChange).toHaveBeenCalledWith("authenticator_replaced");

    const list = screen.getByRole("list", { name: "Backup codes" });
    expect(list).toHaveTextContent("aaaa1111");
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toBeDisabled();
    await u.click(screen.getByLabelText(/saved my backup codes/));
    await u.click(done);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  test("makes backup codes when verifying returns none", async () => {
    user.verifyTOTP.mockResolvedValue({ backupCodes: undefined });
    const u = userEvent.setup();
    render(<NewPhoneSheet onClose={vi.fn()} />);
    await u.click(screen.getByRole("button", { name: "Start" }));
    await u.type(screen.getByLabelText(/6-digit code/), "123456");
    await u.click(screen.getByRole("button", { name: "Verify" }));
    expect(user.createBackupCode).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("list", { name: "Backup codes" }),
    ).toHaveTextContent("cccc3333");
  });

  test("a wrong code keeps the QR step and records nothing", async () => {
    user.verifyTOTP.mockRejectedValue({
      errors: [{ code: "form_code_incorrect" }],
    });
    const u = userEvent.setup();
    render(<NewPhoneSheet onClose={vi.fn()} />);
    await u.click(screen.getByRole("button", { name: "Start" }));
    await u.type(screen.getByLabelText(/6-digit code/), "000000");
    await u.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code isn't right.",
    );
    expect(recordSecurityChange).not.toHaveBeenCalled();
  });

  test("Cancel before starting changes nothing", async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(<NewPhoneSheet onClose={onClose} />);
    await u.click(screen.getByRole("button", { name: "Cancel" }));
    expect(user.disableTOTP).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  test("without an authenticator it skips the removal", async () => {
    user.totpEnabled = false;
    const u = userEvent.setup();
    render(<NewPhoneSheet onClose={vi.fn()} />);
    await u.click(screen.getByRole("button", { name: "Start" }));
    expect(user.disableTOTP).not.toHaveBeenCalled();
    expect(user.createTOTP).toHaveBeenCalledOnce();
  });
});

describe("NewBackupCodesSheet", () => {
  test("confirms first, then shows the new codes and records it", async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(<NewBackupCodesSheet onClose={onClose} />);
    expect(user.createBackupCode).not.toHaveBeenCalled();

    await u.click(screen.getByRole("button", { name: "Make new codes" }));
    expect(
      screen.getByRole("list", { name: "Backup codes" }),
    ).toHaveTextContent("dddd4444");
    expect(recordSecurityChange).toHaveBeenCalledWith(
      "backup_codes_regenerated",
    );
    await u.click(screen.getByLabelText(/saved my backup codes/));
    await u.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
