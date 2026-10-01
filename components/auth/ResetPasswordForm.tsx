"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, InlineError, PasswordField, TextField } from "@/components/ui";
import { AuthHeading } from "./AuthLayout";
import { authErrorMessage } from "./authErrors";
import { DeviceCodeStep, TotpStep } from "./CodeSteps";
import { useFinishSignIn } from "./useFinishSignIn";

type Step = "email" | "newPassword" | "totp" | "device";

/** Reset password with an email code (design: Sign-in · Reset password). */
export function ResetPasswordForm() {
  const { signIn, fetchStatus } = useSignIn();
  const finish = useFinishSignIn();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  function restart() {
    void signIn.reset();
    setCode("");
    setPassword("");
    setError(null);
    setStep("email");
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: createError } = await signIn.create({
      identifier: email.trim(),
    });
    if (createError) return setError(authErrorMessage(createError));
    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) return setError(authErrorMessage(sendError));
    setStep("newPassword");
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (signIn.status !== "needs_new_password") {
      const { error: verifyError } =
        await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verifyError) return setError(authErrorMessage(verifyError));
    }
    const { error: submitError } =
      await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      });
    if (submitError) return setError(authErrorMessage(submitError));

    switch (signIn.status) {
      case "complete": {
        const finishError = await finish();
        if (finishError) setError(authErrorMessage(finishError));
        return;
      }
      case "needs_second_factor":
        return setStep("totp");
      case "needs_client_trust": {
        const { error: sendError } = await signIn.mfa.sendEmailCode();
        if (sendError) return setError(authErrorMessage(sendError));
        return setStep("device");
      }
      default:
        return setError(authErrorMessage(null));
    }
  }

  if (step === "totp") return <TotpStep onBack={restart} />;
  if (step === "device")
    return <DeviceCodeStep email={email.trim()} onBack={restart} />;

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-7" noValidate>
        <p className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
          Step 1 of 2
        </p>
        <AuthHeading title="Reset password">
          Enter your work email. If it has an account, we&apos;ll send a reset
          code.
        </AuthHeading>
        <TextField
          label="Work email"
          type="email"
          autoComplete="username"
          placeholder="name@laine.ai"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fieldSize="lg"
          autoFocus
          required
        />
        {error && <InlineError live>{error}</InlineError>}
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy}
          disabled={!email.trim()}
        >
          Send reset code
        </Button>
        <Link
          href="/sign-in"
          className="text-[13px] font-semibold text-ink hover:text-signal"
        >
          Back to sign in
        </Link>
      </form>
    );
  }

  return (
    <form onSubmit={savePassword} className="flex flex-col gap-6" noValidate>
      <p className="text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
        Step 2 of 2
      </p>
      <AuthHeading title="New password">
        We sent a code to <strong className="text-ink">{email.trim()}</strong>.
      </AuthHeading>
      <TextField
        label="Code from email"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        fieldSize="lg"
        inputClassName="tracking-[0.3em]"
        autoFocus
        required
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint="At least 15 characters. Passwords found in known data breaches are rejected."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fieldSize="lg"
        required
      />
      {error && <InlineError live>{error}</InlineError>}
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={busy}
        disabled={!code.trim() || !password}
      >
        Save and sign in
      </Button>
      <Button variant="text" size="sm" onClick={restart} className="self-start">
        Start again
      </Button>
    </form>
  );
}
