"use client";

import { useSession } from "@clerk/nextjs";
import type {
  EmailCodeFactor,
  SessionVerificationLevel,
  SessionVerificationResource,
} from "@clerk/nextjs/types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Button,
  InlineError,
  PasswordField,
  Sheet,
  TextField,
} from "@/components/ui";
import { securityErrorMessage } from "./securityErrors";

type Stage = "starting" | "password" | "email_code" | "second" | "failed";

type Request = {
  level: SessionVerificationLevel | undefined;
  complete: () => void;
  cancel: () => void;
};

const codeInput = "font-serif text-[26px] tracking-[0.4em]";

/**
 * Our own "Confirm it's you" for Clerk reverification. Pass `onNeeds` to
 * useReverification({ onNeedsReverification }) and render `prompt`; without
 * it Clerk would open its own hosted modal (all auth screens are ours).
 */
export function useReverifyPrompt() {
  const [request, setRequest] = useState<Request | null>(null);
  const onNeeds = useCallback((r: Request) => setRequest(r), []);
  const prompt = request ? (
    <ReverifySheet
      level={request.level}
      onComplete={() => {
        setRequest(null);
        request.complete();
      }}
      onCancel={() => {
        setRequest(null);
        request.cancel();
      }}
    />
  ) : null;
  return { onNeeds, prompt };
}

/**
 * Password (or an email code if there is no password) and then, when Clerk
 * asks for it, the authenticator or a backup code — the same steps as
 * sign-in. Clerk then lets the action through for 10 minutes.
 */
export function ReverifySheet({
  level,
  onComplete,
  onCancel,
}: {
  level: SessionVerificationLevel | undefined;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { session } = useSession();
  const started = useRef(false);
  const finished = useRef(false);
  const [stage, setStage] = useState<Stage>("starting");
  const [email, setEmail] = useState<EmailCodeFactor | null>(null);
  const [useBackup, setUseBackup] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = useCallback(
    async (verification: SessionVerificationResource) => {
      setValue("");
      if (verification.status === "complete") {
        finished.current = true;
        onComplete();
        return;
      }
      if (verification.status === "needs_second_factor") {
        setStage("second");
        return;
      }
      const factors = verification.supportedFirstFactors ?? [];
      if (factors.some((f) => f.strategy === "password")) {
        setStage("password");
        return;
      }
      const emailFactor = factors.find(
        (f): f is EmailCodeFactor => f.strategy === "email_code",
      );
      if (!emailFactor || !session) {
        setStage("failed");
        return;
      }
      await session.prepareFirstFactorVerification({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
      setEmail(emailFactor);
      setStage("email_code");
    },
    [onComplete, session],
  );

  useEffect(() => {
    if (started.current || !session) return;
    started.current = true;
    session
      .startVerification({ level: level ?? "first_factor" })
      .then(next)
      .catch((err) => {
        setError(securityErrorMessage(err));
        setStage("failed");
      });
  }, [session, level, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setBusy(true);
    try {
      const code = value.trim();
      const verification =
        stage === "password"
          ? await session.attemptFirstFactorVerification({
              strategy: "password",
              password: value,
            })
          : stage === "email_code"
            ? await session.attemptFirstFactorVerification({
                strategy: "email_code",
                code,
              })
            : await session.attemptSecondFactorVerification({
                strategy: useBackup ? "backup_code" : "totp",
                code,
              });
      await next(verification);
    } catch (err) {
      setError(securityErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (!finished.current) onCancel();
  }

  return (
    <Sheet eyebrow="Security check" title="Confirm it's you" onClose={close}>
      {stage === "starting" && (
        <p role="status" className="text-sm text-graphite">
          One moment…
        </p>
      )}

      {stage === "failed" && (
        <>
          <InlineError live>
            {error ??
              "We couldn't check it's you. Sign out, sign in again and retry."}
          </InlineError>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </>
      )}

      {(stage === "password" ||
        stage === "email_code" ||
        stage === "second") && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm leading-relaxed text-graphite">
            {stage === "password" &&
              "For your safety, enter your password before changing how you sign in."}
            {stage === "email_code" && (
              <>
                We sent a 6-digit code to{" "}
                <strong className="text-ink">{email?.safeIdentifier}</strong>.
              </>
            )}
            {stage === "second" &&
              (useBackup
                ? "Enter one of your backup codes."
                : "Enter the 6-digit code from your authenticator app.")}
          </p>

          {stage === "password" ? (
            <PasswordField
              key="password"
              label="Password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          ) : (
            <TextField
              key={stage + String(useBackup)}
              label={
                stage === "email_code"
                  ? "Email code"
                  : useBackup
                    ? "Backup code"
                    : "Authenticator code"
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              maxLength={useBackup ? 32 : 6}
              inputClassName={useBackup ? undefined : codeInput}
              autoFocus
              required
            />
          )}

          {error && <InlineError live>{error}</InlineError>}

          <div className="flex flex-col gap-2 md:flex-row-reverse">
            <Button
              type="submit"
              loading={busy}
              disabled={value.trim().length === 0}
            >
              Continue
            </Button>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>

          {stage === "second" && (
            <Button
              variant="text"
              size="sm"
              className="self-start"
              onClick={() => {
                setUseBackup((v) => !v);
                setValue("");
                setError(null);
              }}
            >
              {useBackup
                ? "Use authenticator code"
                : "Use a backup code instead"}
            </Button>
          )}
        </form>
      )}
    </Sheet>
  );
}
