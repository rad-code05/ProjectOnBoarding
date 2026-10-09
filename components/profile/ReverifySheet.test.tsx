import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { ReverifySheet } from "./ReverifySheet";

// A fake Clerk session: the tests decide what each verification step returns.
const session = {
  startVerification: vi.fn(),
  prepareFirstFactorVerification: vi.fn(),
  attemptFirstFactorVerification: vi.fn(),
  attemptSecondFactorVerification: vi.fn(),
};

vi.mock("@clerk/nextjs", () => ({ useSession: () => ({ session }) }));
vi.mock("@clerk/nextjs/errors", () => ({
  isReverificationCancelledError: () => false,
}));

const needsPassword = {
  status: "needs_first_factor",
  supportedFirstFactors: [{ strategy: "password" }],
};

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

describe("ReverifySheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.startVerification.mockResolvedValue(needsPassword);
  });

  test("password, then authenticator code, then the action continues", async () => {
    session.attemptFirstFactorVerification.mockResolvedValue({
      status: "needs_second_factor",
    });
    session.attemptSecondFactorVerification.mockResolvedValue({
      status: "complete",
    });
    const onComplete = vi.fn();
    const u = userEvent.setup();
    render(
      <ReverifySheet
        level="multi_factor"
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );

    expect(session.startVerification).toHaveBeenCalledWith({
      level: "multi_factor",
    });
    await u.type(await screen.findByLabelText(/^Password/), "my-password");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect(session.attemptFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "password",
      password: "my-password",
    });

    await u.type(await screen.findByLabelText(/Authenticator code/), "123456");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({
      strategy: "totp",
      code: "123456",
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  test("a backup code can be used instead of the authenticator", async () => {
    session.startVerification.mockResolvedValue({
      status: "needs_second_factor",
    });
    session.attemptSecondFactorVerification.mockResolvedValue({
      status: "complete",
    });
    const u = userEvent.setup();
    render(
      <ReverifySheet
        level={undefined}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await u.click(
      await screen.findByRole("button", { name: "Use a backup code instead" }),
    );
    await u.type(screen.getByLabelText(/Backup code/), "abcd-efgh");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({
      strategy: "backup_code",
      code: "abcd-efgh",
    });
  });

  test("a wrong password shows a message and stays open", async () => {
    session.attemptFirstFactorVerification.mockRejectedValue({
      errors: [{ code: "form_password_incorrect" }],
    });
    const onComplete = vi.fn();
    const u = userEvent.setup();
    render(
      <ReverifySheet
        level={undefined}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    await u.type(await screen.findByLabelText(/^Password/), "nope");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That password isn't right.",
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("Cancel cancels the action", async () => {
    const onCancel = vi.fn();
    const u = userEvent.setup();
    render(
      <ReverifySheet
        level={undefined}
        onComplete={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await screen.findByLabelText(/^Password/);
    await u.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
