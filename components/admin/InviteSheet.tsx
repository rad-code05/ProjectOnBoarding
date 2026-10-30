"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { inviteUser } from "@/app/(app)/admin/users/actions";
import { Button, InlineError, Sheet } from "@/components/ui";
import { ROLE_NOTES, ROLE_ORDER } from "@/lib/admin/users-shared";
import type { Role } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";
import { fieldClass } from "./ListFields";

/**
 * Invite a person (board: Invite a person (sheet)): name, work email and
 * roles. The database checks first, then Clerk emails the invitation (7
 * days); the roles apply when the person accepts it.
 */
export function InviteSheet({
  onClose,
  onSent,
}: {
  onClose: () => void;
  /** Told the email it went to, for the confirmation line. */
  onSent: (email: string) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = firstName.trim() || "They";

  const send = () =>
    start(async () => {
      setError(null);
      if (roles.length === 0) {
        setError("Choose at least one role.");
        return;
      }
      const result = await inviteUser({ email, firstName, lastName, roles });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSent(email.trim().toLowerCase());
      onClose();
      router.refresh();
    });

  return (
    <Sheet
      eyebrow="Users & roles"
      title="Invite a person"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={send}>
            Send invitation
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-first`} className="text-[13px] font-semibold">
            First name
          </label>
          <input
            id={`${id}-first`}
            value={firstName}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setFirstName(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-last`} className="text-[13px] font-semibold">
            Last name
          </label>
          <input
            id={`${id}-last`}
            value={lastName}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setLastName(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="text-[13px] font-semibold">
          Work email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          value={email}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
        <span className="text-xs text-graphite">
          The invitation goes here. It works for 7 days.
        </span>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-[13px] font-semibold">
          Roles — at least one
        </legend>
        {ROLE_ORDER.map((role) => (
          <label
            key={role}
            className="flex min-h-14 items-start gap-2.5 rounded-xl border border-field-border px-3 py-2.5"
          >
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={(e) =>
                setRoles((current) =>
                  e.target.checked
                    ? [...current, role]
                    : current.filter((r) => r !== role),
                )
              }
              className="mt-0.5 size-5 shrink-0 accent-ink"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold">{ROLE_LABELS[role]}</span>
              <span className="text-xs leading-snug text-graphite">
                {ROLE_NOTES[role]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5 rounded-xl bg-sand px-3.5 py-3">
        <span className="text-[13px] font-bold">
          Approver with other roles?
        </span>
        <span className="text-xs leading-normal text-graphite">
          Allowed — but nobody approves a request they prepared or executed. An
          approver who is also IT can only confirm other people&rsquo;s
          requests.
        </span>
      </div>

      <span className="text-xs leading-normal text-graphite">
        {first} get{first === "They" ? "" : "s"} an email from Laine onboarding
        rights, set a password and MFA, then land on their start page. The
        invitation and the roles are written to the audit log, and approvers see
        them under Role changes.
      </span>

      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
