"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveUserRoles } from "@/app/(app)/admin/users/actions";
import { Button, InlineError, Sheet } from "@/components/ui";
import {
  lockedRoles,
  personName,
  ROLE_NOTES,
  ROLE_ORDER,
  sameRoles,
  type AdminPerson,
} from "@/lib/admin/users-shared";
import type { Role } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";
import { cn } from "@/lib/cn";

/**
 * A person's roles (board: Phone · Edit a person's roles, deactivate): one
 * checkbox per role; the last active approver / admin keeps that role
 * (locked); your own row is read-only. The database checks and audits it.
 */
export function UserSheet({
  person,
  people,
  you,
  meta,
  onClose,
}: {
  person: AdminPerson;
  people: AdminPerson[];
  you: string;
  meta: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>(person.roles);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const own = person.id === you;
  const editable = person.active && !own;
  const locked = lockedRoles(person, people);
  const changed = !sameRoles(roles, person.roles);

  const toggle = (role: Role, on: boolean) => {
    setSaved(false);
    setRoles((current) =>
      on ? [...current, role] : current.filter((r) => r !== role),
    );
  };

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveUserRoles({ userId: person.id, roles });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });

  return (
    <Sheet
      eyebrow={`Users & roles · ${person.active ? "Active" : "Deactivated"}`}
      title={personName(person)}
      onClose={onClose}
      footer={
        editable ? (
          <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
            <Button variant="secondary" onClick={onClose}>
              {saved && !changed ? "Close" : "Cancel"}
            </Button>
            <Button loading={pending} disabled={!changed} onClick={save}>
              Save roles
            </Button>
          </div>
        ) : undefined
      }
    >
      <p className="-mt-2 text-xs break-all text-graphite">
        {person.email} · {meta}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-[13px] font-semibold">Roles</legend>
        {ROLE_ORDER.map((role) => {
          const on = roles.includes(role);
          const lock =
            on && person.roles.includes(role) ? locked[role] : undefined;
          return (
            <label
              key={role}
              className={cn(
                "flex min-h-13 items-start gap-2.5 rounded-xl border border-field-border px-3 py-2.5",
                (!editable || lock) && "text-graphite",
              )}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!editable || Boolean(lock)}
                onChange={(e) => toggle(role, e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-ink"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-ink">
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs leading-snug text-graphite">
                  {lock ?? ROLE_NOTES[role]}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {own && (
        <p
          role="note"
          className="rounded-xl border border-ink px-3.5 py-3 text-xs leading-normal"
        >
          This is you. Nobody changes their own roles — another admin can.
        </p>
      )}
      {!person.active && (
        <p
          role="note"
          className="rounded-xl border border-ink px-3.5 py-3 text-xs leading-normal"
        >
          Deactivated — can&rsquo;t sign in. Everything they prepared or signed
          stays on the records.
        </p>
      )}
      {editable && Object.keys(locked).length > 0 && (
        <p
          role="note"
          className="rounded-xl border border-ink px-3.5 py-3 text-xs leading-normal"
        >
          {personName(person)} is the only active{" "}
          {Object.keys(locked)
            .map((r) => ROLE_LABELS[r as Role].toLowerCase())
            .join(" and ")}
          . Give another person that role first to take it away.
        </p>
      )}
      {editable && (
        <span className="text-xs leading-normal text-graphite">
          Given roles take effect at once; removed ones on their next page.
          Written to the audit log and shown to approvers under Role changes.
        </span>
      )}

      {saved && !changed && (
        <p role="status" className="text-sm font-semibold">
          ✓ Roles saved
        </p>
      )}
      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
