"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import { Button, InlineError, TextField } from "@/components/ui";
import { AuthHeading } from "./AuthLayout";
import { authErrorMessage } from "./authErrors";
import { useFinishSignIn } from "./useFinishSignIn";

const codeInput = "font-serif text-[26px] tracking-[0.4em]";

/** Authenticator-app (TOTP) code on sign-in, with backup-code fallback. */
export function TotpStep({ onBack }: { onBack: () => void }) {
  const { signIn, fetchStatus } = useSignIn();
  const finish = useFinishSignIn();
  const [useBackup, setUseBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: verifyError } = useBackup
      ? await signIn.mfa.verifyBackupCode({ code: code.trim() })
      : await signIn.mfa.verifyTOTP({ code: code.trim() });
    if (verifyError) return setError(authErrorMessage(verifyError));
    if (signIn.status === "complete") {
      const finishError = await finish();
      if (finishError) setError(authErrorMessage(finishError));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
      <AuthHeading title="Two-step check">
        {useBackup
          ? "Enter one of the backup codes you saved when you set up your authenticator app."
          : "Open your authenticator app and enter the 6-digit code for Laine onboarding rights."}
      </AuthHeading>
      <TextField
        key={useBackup ? "backup" : "totp"}
        label={useBackup ? "Backup code" : "Authenticator code"}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode={useBackup ? "text" : "numeric"}
        autoComplete="one-time-code"
        maxLength={useBackup ? 32 : 6}
        fieldSize="lg"
        inputClassName={useBackup ? undefined : codeInput}
        autoFocus
        required
      />
      {error && <InlineError live>{error}</InlineError>}
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={fetchStatus === "fetching"}
        disabled={code.trim().length === 0}
      >
        Verify and continue
      </Button>
      <div className="flex justify-between gap-4">
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            setUseBackup((v) => !v);
            setCode("");
            setError(null);
          }}
        >
          {useBackup ? "Use authenticator code" : "Use a backup code instead"}
        </Button>
        <Button variant="text" size="sm" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    </form>
  );
}

/** "Check your email" — new-device verification (Clerk device trust). */
export function DeviceCodeStep({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const { signIn, fetchStatus } = useSignIn();
  const finish = useFinishSignIn();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: verifyError } = await signIn.mfa.verifyEmailCode({
      code: code.trim(),
    });
    if (verifyError) return setError(authErrorMessage(verifyError));
    if (signIn.status === "complete") {
      const finishError = await finish();
      if (finishError) setError(authErrorMessage(finishError));
    }
  }

  async function resend() {
    setError(null);
    const { error: sendError } = await signIn.mfa.sendEmailCode();
    if (sendError) setError(authErrorMessage(sendError));
    else setResent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
      <AuthHeading title="Check your email">
        You&apos;re signing in from a new device. We sent a 6-digit code to{" "}
        <strong className="text-ink">{email}</strong>.
      </AuthHeading>
      <TextField
        label="Verification code"
        hint="The code expires in 10 minutes."
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        fieldSize="lg"
        inputClassName={codeInput}
        autoFocus
        required
      />
      {error && <InlineError live>{error}</InlineError>}
      {resent && !error && (
        <p role="status" className="text-[13px] text-graphite">
          A new code is on its way.
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={fetchStatus === "fetching"}
        disabled={code.trim().length === 0}
      >
        Verify and continue
      </Button>
      <div className="flex justify-between gap-4">
        <Button variant="text" size="sm" onClick={resend}>
          Send a new code
        </Button>
        <Button variant="text" size="sm" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    </form>
  );
}
