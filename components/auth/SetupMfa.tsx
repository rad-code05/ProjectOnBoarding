"use client";

import {
  useClerk,
  useReverification,
  useSession,
  useUser,
} from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, InlineError, TextField } from "@/components/ui";
import { AuthHeading } from "./AuthLayout";
import { authErrorMessage } from "./authErrors";
import { AuthenticatorQr, BackupCodeList } from "./MfaPieces";

type Step = "intro" | "scan" | "codes";

/**
 * First-time MFA setup in our own design (Clerk session task "setup-mfa"):
 * 1. create an authenticator secret → show QR code
 * 2. verify the first 6-digit code
 * 3. show backup codes → finish (activates the session)
 */
export function SetupMfa() {
  const { user } = useUser();
  const { session } = useSession();
  const clerk = useClerk();
  const router = useRouter();

  const [step, setStep] = useState<Step>("intro");
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTOTP = useReverification(() => user?.createTOTP());
  const createBackupCode = useReverification(() => user?.createBackupCode());

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const totp = await createTOTP();
      setUri(totp?.uri ?? null);
      setSecret(totp?.secret ?? null);
      setStep("scan");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const totp = await user?.verifyTOTP({ code: code.trim() });
      let codes = totp?.backupCodes ?? [];
      if (codes.length === 0) {
        const backup = await createBackupCode();
        codes = backup?.codes ?? [];
      }
      setBackupCodes(codes);
      setStep("codes");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setError(null);
    setBusy(true);
    try {
      await clerk.setActive({
        session: session?.id,
        navigate: async ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) window.location.href = url;
          else router.push(url);
        },
      });
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  if (step === "intro") {
    return (
      <div className="flex flex-col gap-7">
        <AuthHeading title="Protect your account">
          Laine onboarding rights requires a second step at sign-in. You&apos;ll
          need an authenticator app on your phone, such as Microsoft
          Authenticator or Google Authenticator.
        </AuthHeading>
        {error && <InlineError live>{error}</InlineError>}
        <Button size="lg" fullWidth loading={busy} onClick={start}>
          Set up authenticator app
        </Button>
      </div>
    );
  }

  if (step === "scan") {
    return (
      <form onSubmit={verify} className="flex flex-col gap-6" noValidate>
        <AuthHeading title="Scan the code">
          In your authenticator app, add an account and scan this QR code.
        </AuthHeading>
        <AuthenticatorQr uri={uri} secret={secret} />
        <TextField
          label="6-digit code from the app"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          fieldSize="lg"
          inputClassName="font-serif text-[26px] tracking-[0.4em]"
          required
        />
        {error && <InlineError live>{error}</InlineError>}
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy}
          disabled={code.trim().length !== 6}
        >
          Verify
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Save your backup codes">
        If you lose your phone, each of these codes lets you sign in once. Save
        them somewhere safe — they won&apos;t be shown again.
      </AuthHeading>
      <BackupCodeList
        codes={backupCodes}
        email={user?.primaryEmailAddress?.emailAddress ?? ""}
        saved={saved}
        onSavedChange={setSaved}
      />
      {error && <InlineError live>{error}</InlineError>}
      <Button
        size="lg"
        fullWidth
        loading={busy}
        disabled={!saved}
        onClick={finish}
      >
        Finish and continue
      </Button>
    </div>
  );
}
