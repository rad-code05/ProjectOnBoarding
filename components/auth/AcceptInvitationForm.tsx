"use client";

import { useAuth, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Button,
  InlineError,
  Notice,
  PasswordField,
  TextField,
} from "@/components/ui";
import { AuthHeading } from "./AuthLayout";
import { authErrorMessage } from "./authErrors";

type Step = "checking" | "form" | "invalid";

const MIN_PASSWORD = 8;

/**
 * Accept invitation (board: Phone · Accept invitation): the link from Raju's
 * invitation email lands here with Clerk's `__clerk_ticket`. Opening the page
 * starts the sign-up with the ticket (an old or withdrawn link fails here,
 * before anything is typed); Continue adds name + password to the same
 * sign-up, then the existing MFA set-up (session task) takes over. The roles
 * are applied by the Clerk webhook when the account is created (F18a).
 */
export function AcceptInvitationForm({ ticket }: { ticket: string | null }) {
  const { signUp, fetchStatus } = useSignUp();
  const { isLoaded } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(ticket ? "checking" : "invalid");
  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Check the link once, after Clerk has loaded in the browser (React may
  // run effects twice while developing).
  useEffect(() => {
    if (!ticket || !isLoaded || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { error: ticketError } = await signUp.ticket({ ticket });
        if (ticketError || !signUp.emailAddress) {
          setStep("invalid");
          return;
        }
        setEmail(signUp.emailAddress);
        setStep("form");
      } catch {
        setStep("invalid");
      }
    })();
  }, [signUp, ticket, isLoaded]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      return setError("Enter your first and last name.");
    }
    if (password.length < MIN_PASSWORD) {
      return setError(
        `The password needs at least ${MIN_PASSWORD} characters.`,
      );
    }
    const { error: passwordError } = await signUp.password({
      emailAddress: email ?? "",
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
    if (passwordError) return setError(authErrorMessage(passwordError));
    if (signUp.status !== "complete") {
      return setError(
        "Something is still missing. Reload the page and try again.",
      );
    }
    const { error: finishError } = await signUp.finalize({
      navigate: async ({ session, decorateUrl }) => {
        // First sign-in: Clerk asks for MFA set-up (a session task).
        if (session?.currentTask) {
          router.push("/session-tasks");
          return;
        }
        const url = decorateUrl("/");
        if (url.startsWith("http")) window.location.href = url;
        else router.push(url);
      },
    });
    if (finishError) setError(authErrorMessage(finishError));
  }

  if (step === "checking") {
    return (
      <div className="flex flex-col gap-4">
        <AuthHeading title="Welcome">Checking your invitation…</AuthHeading>
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="flex flex-col gap-7">
        <AuthHeading title="This link doesn't work">
          This invitation has expired or was withdrawn. Ask Raju to send it
          again.
        </AuthHeading>
        <Notice className="border-t border-line pt-5">
          Already have an account?{" "}
          <Link href="/sign-in" className="underline underline-offset-2">
            Sign in
          </Link>
        </Notice>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Step 1 of 2 · then MFA
        </span>
        <AuthHeading title="Welcome">
          You were invited to Laine onboarding rights. Check your name and
          choose a password.
        </AuthHeading>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Work email</span>
          <span className="flex h-12.5 items-center rounded-[10px] bg-line-subtle px-4 text-base break-all">
            {email}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <TextField
            label="First name"
            name="given-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            fieldSize="lg"
            required
          />
          <TextField
            label="Last name"
            name="family-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            fieldSize="lg"
            required
          />
        </div>
        <PasswordField
          label="Password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fieldSize="lg"
          hint={`At least ${MIN_PASSWORD} characters. Not one found in known leaks.`}
          required
        />
      </div>

      {error && <InlineError live>{error}</InlineError>}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={fetchStatus === "fetching"}
      >
        Continue — set up MFA
      </Button>

      <Notice className="border-t border-line pt-5">
        Next: scan a QR code with an authenticator app and save your backup
        codes. Then you land on your start page. Already have an account?{" "}
        <Link href="/sign-in" className="underline underline-offset-2">
          Sign in
        </Link>
      </Notice>
    </form>
  );
}
