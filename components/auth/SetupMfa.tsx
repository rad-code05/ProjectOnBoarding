"use client";

import {
  useClerk,
  useReverification,
  useSession,
  useUser,
} from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";
import { Button, InlineError, TextField } from "@/components/ui";
import { AuthHeading } from "./AuthLayout";
import { authErrorMessage } from "./authErrors";

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

  function download() {
    const text = [
      "Laine onboarding rights — backup codes",
      `Account: ${user?.primaryEmailAddress?.emailAddress ?? ""}`,
      "Each code works once. Keep this file somewhere safe.",
      "",
      ...backupCodes,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "laine-onboarding-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
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
        {uri && (
          <div className="self-start rounded-card border border-line bg-paper p-4">
            <QRCodeSVG
              value={uri}
              size={176}
              bgColor="#ffffff"
              fgColor="#000000"
              title="QR code for your authenticator app"
            />
          </div>
        )}
        {secret && (
          <details className="text-[13px] text-graphite">
            <summary className="cursor-pointer font-semibold text-ink">
              Can&apos;t scan? Enter the key manually
            </summary>
            <code className="mt-2 block rounded-field bg-paper px-3 py-2 font-mono text-sm break-all text-ink">
              {secret}
            </code>
          </details>
        )}
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
      <ol className="grid grid-cols-2 gap-2 rounded-card border border-line bg-paper p-4 font-mono text-sm">
        {backupCodes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <Button variant="secondary" onClick={download} className="self-start">
        Download as text file
      </Button>
      <label className="flex items-start gap-3 rounded-field bg-paper p-3 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 size-4 accent-ink"
        />
        I&apos;ve saved my backup codes somewhere safe.
      </label>
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
