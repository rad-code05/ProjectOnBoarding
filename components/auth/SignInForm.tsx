"use client";

import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Button,
  InlineError,
  Notice,
  PasswordField,
  TextField,
} from "@/components/ui";
import { AuthHeading } from "./AuthLayout";
import { authErrorMessage, WRONG_CREDENTIALS } from "./authErrors";
import { DeviceCodeStep, TotpStep } from "./CodeSteps";
import { useFinishSignIn } from "./useFinishSignIn";

type Step = "credentials" | "totp" | "device";

/** Our own sign-in form (design: Sign-in boards) on top of Clerk's useSignIn. */
export function SignInForm() {
  const { signIn, fetchStatus } = useSignIn();
  const finish = useFinishSignIn();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function backToStart() {
    void signIn.reset();
    setPassword("");
    setError(null);
    setStep("credentials");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const { error: passwordError } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });
    if (passwordError) return setError(authErrorMessage(passwordError));

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
        return setError(WRONG_CREDENTIALS);
    }
  }

  if (step === "totp") return <TotpStep onBack={backToStart} />;
  if (step === "device")
    return <DeviceCodeStep email={email.trim()} onBack={backToStart} />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
      <AuthHeading title="Sign in">
        Use the account your administrator created for you.
      </AuthHeading>

      <div className="flex flex-col gap-4">
        <TextField
          label="Work email"
          type="email"
          name="email"
          autoComplete="username"
          placeholder="name@laine.ai"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fieldSize="lg"
          required
        />
        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fieldSize="lg"
          error={error === WRONG_CREDENTIALS ? error : undefined}
          labelAside={
            <Link
              href="/reset-password"
              className="text-[13px] text-ink underline-offset-2 hover:text-signal hover:underline"
            >
              Forgot password?
            </Link>
          }
          required
        />
      </div>

      {error && error !== WRONG_CREDENTIALS && (
        <InlineError live>{error}</InlineError>
      )}
      {error === WRONG_CREDENTIALS && (
        <p role="alert" className="sr-only">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={fetchStatus === "fetching"}
        disabled={!email.trim() || !password}
      >
        Sign in
      </Button>

      <Notice className="border-t border-line pt-5">
        Access is by invitation only. There is no self sign-up — contact Raju if
        you need an account.
      </Notice>
    </form>
  );
}
