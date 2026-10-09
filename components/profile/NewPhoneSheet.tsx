"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import { recordSecurityChange } from "@/app/(app)/profile/security/actions";
import { AuthenticatorQr, BackupCodeList } from "@/components/auth/MfaPieces";
import { Button, InlineError, Sheet, TextField } from "@/components/ui";
import { useReverifyPrompt } from "./ReverifySheet";
import { securityErrorMessage } from "./securityErrors";

type Step = "intro" | "scan" | "codes";

/**
 * Move the authenticator to a new phone. Clerk only replaces a secret that
 * is not yet confirmed, so: remove the old one → new QR code → confirm with
 * a code → new backup codes. Stopping halfway leaves no authenticator; the
 * next sign-in then asks for one ("Protect your account", S5).
 */
export function NewPhoneSheet({
  onClose,
}: {
  onClose: (changed: boolean) => void;
}) {
  const { user } = useUser();
  const reverify = useReverifyPrompt();
  const options = { onNeedsReverification: reverify.onNeeds };
  const disableTOTP = useReverification(() => user!.disableTOTP(), options);
  const createTOTP = useReverification(() => user!.createTOTP(), options);
  const verifyTOTP = useReverification(
    (code: string) => user!.verifyTOTP({ code }),
    options,
  );
  const createBackupCode = useReverification(
    () => user!.createBackupCode(),
    options,
  );

  const [step, setStep] = useState<Step>("intro");
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(securityErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      if (user?.totpEnabled && !removed) {
        await disableTOTP();
        setRemoved(true);
      }
      const totp = await createTOTP();
      setUri(totp.uri ?? null);
      setSecret(totp.secret ?? null);
      setStep("scan");
    });

  const verify = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const totp = await verifyTOTP(code.trim());
      let fresh = totp.backupCodes ?? [];
      if (fresh.length === 0) fresh = (await createBackupCode()).codes;
      setCodes(fresh);
      setStep("codes");
      await recordSecurityChange("authenticator_replaced");
    });
  };

  // Changed = the old authenticator is gone, so the page must re-read it.
  const close = () => onClose(removed || step === "codes");

  return (
    <>
      <Sheet
        eyebrow="Authenticator app"
        title="Set up on a new phone"
        onClose={close}
      >
        {step === "intro" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-graphite">
              Have your new phone with the authenticator app ready. Your old
              phone stops working for sign-in as soon as you start. If you stop
              halfway, you&apos;ll be asked to set it up at your next sign-in.
            </p>
            {error && <InlineError live>{error}</InlineError>}
            <div className="flex flex-col gap-2 md:flex-row-reverse">
              <Button loading={busy} onClick={start}>
                Start
              </Button>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "scan" && (
          <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
            <p className="text-sm leading-relaxed text-graphite">
              On your new phone, add an account in the authenticator app and
              scan this QR code. Then enter the 6-digit code it shows.
            </p>
            <AuthenticatorQr uri={uri} secret={secret} />
            <TextField
              label="6-digit code from the app"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputClassName="font-serif text-[26px] tracking-[0.4em]"
              required
            />
            {error && <InlineError live>{error}</InlineError>}
            <Button
              type="submit"
              loading={busy}
              disabled={code.trim().length !== 6}
            >
              Verify
            </Button>
          </form>
        )}

        {step === "codes" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-graphite">
              Done — your new phone is set up. Here are new backup codes; the
              old ones no longer work. Each code lets you sign in once.
            </p>
            <BackupCodeList
              codes={codes}
              email={user?.primaryEmailAddress?.emailAddress ?? ""}
              saved={saved}
              onSavedChange={setSaved}
            />
            <Button disabled={!saved} onClick={close}>
              Done
            </Button>
          </div>
        )}
      </Sheet>
      {reverify.prompt}
    </>
  );
}
