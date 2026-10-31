"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deactivateUser,
  reactivateUser,
  saveUserRoles,
} from "@/app/(app)/admin/users/actions";
import { Button, InlineError, Sheet } from "@/components/ui";
import {
  lockedRoles,
  personName,
  roleLabels,
  ROLE_NOTES,
  ROLE_ORDER,
  sameRoles,
  type AdminPerson,
} from "@/lib/admin/users-shared";
import type { Role } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";
import { cn } from "@/lib/cn";

/**
 * A person's sheet (board: Phone · Edit a person's roles, deactivate): one
 * checkbox per role; the last active approver / admin keeps that role
 * (locked) and can't be deactivated; your own row is read-only. Deactivate
 * asks once more; a deactivated person is reactivated with chosen roles.
 * The database checks and audits it; Clerk blocks / unblocks sign-in (F18d).
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
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const own = person.id === you;
  const editable = !own;
  const locked = lockedRoles(person, people);
  const lockedNames = Object.keys(locked).map((r) =>
    ROLE_LABELS[r as Role].toLowerCase(),
  );
  const changed = !sameRoles(roles, person.roles);
  const name = personName(person);

  const toggle = (role: Role, on: boolean) => {
    setDone(null);
    setRoles((current) =>
      on ? [...current, role] : current.filter((r) => r !== role),
    );
  };

  const run = (
    work: () => Promise<{ ok: boolean; message?: string }>,
    said: string,
    after?: () => void,
  ) =>
    start(async () => {
      setError(null);
      setDone(null);
      const result = await work();
      if (!result.ok) {
        setError(result.message ?? "Could not save.");
        router.refresh();
        return;
      }
      after?.();
      setDone(said);
      router.refresh();
    });

  const footer = !editable ? undefined : (
    <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
      <Button variant="secondary" onClick={onClose}>
        {done ? "Close" : "Cancel"}
      </Button>
      {person.active ? (
        <Button
          loading={pending}
          disabled={!changed}
          onClick={() =>
            run(
              () => saveUserRoles({ userId: person.id, roles }),
              "Roles saved",
            )
          }
        >
          Save roles
        </Button>
      ) : (
        <Button
          loading={pending}
          disabled={roles.length === 0}
          onClick={() =>
            run(
              () => reactivateUser({ userId: person.id, roles }),
              `${name} is active again and can sign in`,
            )
          }
        >
          Reactivate
        </Button>
      )}
    </div>
  );

  return (
    <Sheet
      eyebrow={`Users & roles · ${person.active ? "Active" : "Deactivated"}`}
      title={name}
      onClose={onClose}
      footer={footer}
    >
      <p className="-mt-2 text-xs break-all text-graphite">
        {person.email} · {meta}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-[13px] font-semibold">
          {person.active || own ? "Roles" : "Roles when reactivated"}
        </legend>
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
      {editable && person.active && lockedNames.length > 0 && (
        <p
          role="note"
          className="rounded-xl border border-ink px-3.5 py-3 text-xs leading-normal"
        >
          {name} is the only active {lockedNames.join(" and ")}. Give another
          person that role first to take it away.
        </p>
      )}
      {editable && person.active && (
        <span className="text-xs leading-normal text-graphite">
          Given roles take effect at once; removed ones on their next page.
          Written to the audit log and shown to approvers under Role changes.
        </span>
      )}

      {editable && person.active && (
        <div className="flex flex-col gap-2 rounded-xl border border-signal p-3.5">
          <span className="text-sm font-bold">Deactivate {name}</span>
          <span className="text-xs leading-normal text-graphite">
            They can&rsquo;t sign in any more (blocked in Clerk) and lose every
            role. Everything they prepared, confirmed or signed stays on the
            records and PDFs. You can reactivate them later and give roles
            again.
          </span>
          {lockedNames.length > 0 ? (
            <>
              <span className="text-xs leading-normal text-signal">
                Not possible now: {name} is the only active{" "}
                {lockedNames.join(" and ")}.
              </span>
              <Button
                variant="destructive"
                size="sm"
                className="self-start"
                disabled
              >
                Deactivate…
              </Button>
            </>
          ) : confirming ? (
            <div className="flex flex-col gap-2 rounded-xl bg-sand px-3 py-2.5">
              <span className="text-[13px] font-semibold">
                Deactivate {name}? They can&rsquo;t sign in and lose{" "}
                {roleLabels(person.roles).join(", ") || "no roles"}. Their
                history stays.
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deactivateUser({ userId: person.id }),
                      `${name} is deactivated — sign-in blocked`,
                      () => {
                        setConfirming(false);
                        setRoles([]);
                      },
                    )
                  }
                >
                  Deactivate
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  Keep {person.firstName ?? "them"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              className="self-start"
              onClick={() => setConfirming(true)}
            >
              Deactivate…
            </Button>
          )}
        </div>
      )}

      {editable && !person.active && (
        <div
          role="note"
          className="flex flex-col gap-1.5 rounded-xl border border-ink px-3.5 py-3 text-xs leading-normal"
        >
          <span>
            Deactivated — can&rsquo;t sign in. Everything they prepared or
            signed stays on the records. Choose their roles above and press{" "}
            <b>Reactivate</b> to let them sign in again.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => deactivateUser({ userId: person.id }),
                "Sign-in blocked in Clerk",
              )
            }
            className="self-start font-semibold underline"
          >
            Block sign-in in Clerk again
          </button>
        </div>
      )}

      {done && (
        <p role="status" className="text-sm font-semibold">
          ✓ {done}
        </p>
      )}
      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
