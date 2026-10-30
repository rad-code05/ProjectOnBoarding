import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AcceptInvitationForm } from "./AcceptInvitationForm";

// A fake Clerk sign-up, so tests never talk to Clerk.
const signUp = {
  status: "missing_requirements" as string,
  emailAddress: null as string | null,
  ticket: vi.fn(),
  password: vi.fn(),
  finalize: vi.fn(),
};
const push = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useSignUp: () => ({ signUp, fetchStatus: "idle", errors: {} }),
  useAuth: () => ({ isLoaded: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("AcceptInvitationForm (F18c-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp.status = "missing_requirements";
    signUp.emailAddress = null;
    signUp.ticket.mockImplementation(async () => {
      signUp.emailAddress = "celine@example.test";
      return { error: null };
    });
    signUp.password.mockImplementation(async () => {
      signUp.status = "complete";
      return { error: null };
    });
    signUp.finalize.mockImplementation(async ({ navigate }) => {
      await navigate({
        session: { currentTask: { key: "setup-mfa" } },
        decorateUrl: (u: string) => u,
      });
      return { error: null };
    });
  });

  test("no ticket in the address: the link doesn't work", () => {
    render(<AcceptInvitationForm ticket={null} />);
    expect(
      screen.getByRole("heading", { name: "This link doesn't work" }),
    ).toBeVisible();
    expect(signUp.ticket).not.toHaveBeenCalled();
  });

  test("an expired or withdrawn ticket: told to ask Raju, no form", async () => {
    signUp.ticket.mockResolvedValue({ error: { code: "ticket_expired" } });
    render(<AcceptInvitationForm ticket="t_1" />);
    expect(
      await screen.findByText(/expired or was withdrawn. Ask Raju/),
    ).toBeVisible();
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
  });

  test("the email from the invitation; name + password, then MFA set-up", async () => {
    const u = userEvent.setup();
    render(<AcceptInvitationForm ticket="t_1" />);
    expect(await screen.findByText("celine@example.test")).toBeVisible();
    expect(signUp.ticket).toHaveBeenCalledWith({ ticket: "t_1" });

    await u.type(screen.getByLabelText(/First name/), "Celine");
    await u.type(screen.getByLabelText(/Last name/), "Example");
    await u.type(screen.getByLabelText(/^Password/), "short");
    await u.click(
      screen.getByRole("button", { name: "Continue — set up MFA" }),
    );
    expect(
      screen.getByText("The password needs at least 8 characters."),
    ).toBeVisible();
    expect(signUp.password).not.toHaveBeenCalled();

    await u.type(screen.getByLabelText(/^Password/), " enough now");
    await u.click(
      screen.getByRole("button", { name: "Continue — set up MFA" }),
    );
    expect(signUp.password).toHaveBeenCalledWith({
      emailAddress: "celine@example.test",
      password: "short enough now",
      firstName: "Celine",
      lastName: "Example",
    });
    expect(push).toHaveBeenCalledWith("/session-tasks");
  });

  test("a leaked password is refused in words", async () => {
    const u = userEvent.setup();
    signUp.password.mockResolvedValue({
      error: { errors: [{ code: "form_password_pwned" }] },
    });
    render(<AcceptInvitationForm ticket="t_1" />);
    await u.type(await screen.findByLabelText(/First name/), "Celine");
    await u.type(screen.getByLabelText(/Last name/), "Example");
    await u.type(screen.getByLabelText(/^Password/), "password123");
    await u.click(
      screen.getByRole("button", { name: "Continue — set up MFA" }),
    );
    expect(await screen.findByText(/appeared in a data breach/)).toBeVisible();
    expect(signUp.finalize).not.toHaveBeenCalled();
  });
});
