import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SignInForm } from "./SignInForm";
import { WRONG_CREDENTIALS } from "./authErrors";

// A fake Clerk sign-in object, so tests never talk to Clerk.
const signIn = {
  status: "needs_identifier" as string,
  password: vi.fn(),
  reset: vi.fn(),
  finalize: vi.fn(),
  mfa: {
    verifyTOTP: vi.fn(),
    verifyBackupCode: vi.fn(),
    sendEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
  },
};

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn, fetchStatus: "idle", errors: {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

async function fillAndSubmit(
  email = "raju@laine.ai",
  password = "correct horse",
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Work email/), email);
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn.status = "needs_identifier";
    signIn.password.mockResolvedValue({ error: null });
    signIn.finalize.mockResolvedValue({ error: null });
    signIn.mfa.sendEmailCode.mockResolvedValue({ error: null });
  });

  test("has labelled fields, a reset link and no sign-up link", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/Work email/)).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/reset-password");
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
  });

  test("the button stays disabled until both fields are filled", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Work email/), "raju@laine.ai");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/^Password/), "x");
    expect(button).toBeEnabled();
  });

  test("sends email and password to Clerk and finishes when complete", async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = "complete";
      return { error: null };
    });
    render(<SignInForm />);
    await fillAndSubmit();
    expect(signIn.password).toHaveBeenCalledWith({
      emailAddress: "raju@laine.ai",
      password: "correct horse",
    });
    expect(signIn.finalize).toHaveBeenCalledOnce();
  });

  test("wrong credentials show one message and mark the password invalid", async () => {
    signIn.password.mockResolvedValue({
      error: { errors: [{ code: "form_password_incorrect" }] },
    });
    render(<SignInForm />);
    await fillAndSubmit();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getAllByText(WRONG_CREDENTIALS).length).toBeGreaterThan(0);
    expect(signIn.finalize).not.toHaveBeenCalled();
  });

  test("asks for the authenticator code when a second factor is needed", async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = "needs_second_factor";
      return { error: null };
    });
    signIn.mfa.verifyTOTP.mockImplementation(async () => {
      signIn.status = "complete";
      return { error: null };
    });
    render(<SignInForm />);
    const user = await fillAndSubmit();

    expect(
      screen.getByRole("heading", { name: "Two-step check" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Authenticator code" }),
      "123456",
    );
    await user.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );

    expect(signIn.mfa.verifyTOTP).toHaveBeenCalledWith({ code: "123456" });
    expect(signIn.finalize).toHaveBeenCalledOnce();
  });

  test("can switch to a backup code", async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = "needs_second_factor";
      return { error: null };
    });
    signIn.mfa.verifyBackupCode.mockResolvedValue({ error: null });
    render(<SignInForm />);
    const user = await fillAndSubmit();

    await user.click(
      screen.getByRole("button", { name: "Use a backup code instead" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Backup code" }),
      "abcd-efgh",
    );
    await user.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(signIn.mfa.verifyBackupCode).toHaveBeenCalledWith({
      code: "abcd-efgh",
    });
  });

  test("sends an email code on a new device", async () => {
    signIn.password.mockImplementation(async () => {
      signIn.status = "needs_client_trust";
      return { error: null };
    });
    render(<SignInForm />);
    await fillAndSubmit();

    expect(signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Check your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText("raju@laine.ai")).toBeInTheDocument();
  });
});
