"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import { recordSecurityChange } from "@/app/(app)/profile/security/actions";
import { Button, CheckIcon, InlineError, PasswordField } from "@/components/ui";
import { useReverifyPrompt } from "./ReverifySheet";
import { checkNewPassword, securityErrorMessage } from "./securityErrors";

const EMPTY = { current: "", next: "", repeat: "" };

/**
 * "Change password" on Password & MFA (design: Phone · Password & MFA).
 * Clerk checks the current password and signs out every other device;
 * this device stays signed in.
 */
export function ChangePasswordCard() {
  const { user } = useUser();
  const reverify = useReverifyPrompt();
  const updatePassword = useReverification(
    (params: { currentPassword: string; newPassword: string }) =>
      user!.updatePassword({ ...params, signOutOfOtherSessions: true }),
    { onNeedsReverification: reverify.onNeeds },
  );

  const [fields, setFields] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const field = (key: keyof typeof EMPTY) => ({
    value: fields[key],
    onChange: (e: { target: { value: string } }) => {
      setFields((f) => ({ ...f, [key]: e.target.value }));
      setDone(false);
    },
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkNewPassword(fields);
    setError(problem);
    if (problem || !user) return;
    setBusy(true);
    try {
      await updatePassword({
        currentPassword: fields.current,
        newPassword: fields.next,
      });
      setFields(EMPTY);
      setDone(true);
      await recordSecurityChange("password_changed");
    } catch (err) {
      setError(securityErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="pw-title"
      className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4"
    >
      <h2 id="pw-title" className="font-serif text-[21px]">
        Change password
      </h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
        <PasswordField
          label="Current password"
          autoComplete="current-password"
          {...field("current")}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          {...field("next")}
        />
        <PasswordField
          label="Repeat new password"
          autoComplete="new-password"
          {...field("repeat")}
        />
        <p className="text-xs text-graphite">
          At least 8 characters. You stay signed in on this device; other
          devices are signed out.
        </p>
        {error && <InlineError live>{error}</InlineError>}
        {done && (
          <p
            role="status"
            className="flex items-center gap-2 text-[13px] font-semibold"
          >
            <CheckIcon className="shrink-0" />
            Password changed. Other devices were signed out.
          </p>
        )}
        <Button type="submit" loading={busy} className="md:self-start">
          Change password
        </Button>
      </form>
      {reverify.prompt}
    </section>
  );
}
