"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Avatar,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/ui";
import {
  personName,
  roleLabels,
  sortPeople,
  type AdminInvitation,
  type AdminPerson,
} from "@/lib/admin/users-shared";
import { cn } from "@/lib/cn";
import { InvitationList } from "./InvitationList";
import { InviteSheet } from "./InviteSheet";
import { UserSheet } from "./UserSheet";

type Show = "active" | "invited" | "deactivated";

/**
 * Admin · Users & roles (board: Phone · Admin · Users & roles): who can sign
 * in and what they may do. Each row opens the person's sheet (roles; your
 * own row is read-only); Invite a person + the invitations waiting to be
 * accepted (F18c). Deactivating comes with F18d.
 */
export function UsersAdmin({
  people,
  you,
  meta,
  invitations,
  invitationLines,
}: {
  people: AdminPerson[];
  invitations: AdminInvitation[];
  /** "Sent … by … · expires …" per invitation (server-formatted). */
  invitationLines: Record<string, string>;
  /** The signed-in admin's Clerk id. */
  you: string;
  /** "MFA on · signed in 12 Oct 2026, 09:41" per person (server-formatted). */
  meta: Record<string, string>;
}) {
  const [show, setShow] = useState<Show>("active");
  // By id, so a refresh after saving shows the new roles in the open sheet.
  const [open, setOpen] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const active = people.filter((p) => p.active);
  const shown = sortPeople(
    people.filter((p) => p.active === (show === "active")),
    you,
  );
  const person = people.find((p) => p.id === open) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[32px] leading-tight">
          Users &amp; roles
        </h1>
        <p className="text-[13px] leading-normal text-graphite">
          Who can sign in and what they may do. {active.length} active ·{" "}
          {people.length - active.length} deactivated. Only invited people can
          join — there is no sign-up page.
        </p>
      </div>

      <Button
        className="self-start"
        aria-haspopup="dialog"
        onClick={() => setInviting(true)}
      >
        Invite a person
      </Button>
      {sentTo && (
        <p role="status" className="text-sm font-semibold">
          ✓ Invitation sent to {sentTo}
        </p>
      )}

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {(
          [
            ["active", `Active · ${active.length}`],
            ["invited", `Invited · ${invitations.length}`],
            ["deactivated", `Deactivated · ${people.length - active.length}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={show === value}
            onClick={() => setShow(value)}
            className={cn(
              "h-9 rounded-pill border border-ink px-3.5 text-[13px] font-semibold",
              show === value ? "bg-ink text-paper" : "bg-transparent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {show === "invited" ? null : shown.length === 0 ? (
        <p className="rounded-card border border-line bg-paper p-3.5 text-sm text-graphite">
          {show === "active" ? "Nobody is active." : "Nobody is deactivated."}
        </p>
      ) : (
        <ul
          aria-label="People"
          className="rounded-card border border-line bg-paper"
        >
          {shown.map((p) => (
            <li
              key={p.id}
              className="border-b border-line-subtle last:border-b-0"
            >
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setOpen(p.id)}
                className="flex min-h-19 w-full items-start gap-2.5 px-3.5 py-3 text-left"
              >
                <Avatar name={personName(p)} tone="ink" size="md" decorative />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] font-bold">
                    {personName(p)}
                    {p.id === you && (
                      <span className="ml-1 text-xs font-medium text-graphite">
                        (you)
                      </span>
                    )}
                  </span>
                  <span className="text-xs break-all text-graphite">
                    {p.email}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {p.roles.length === 0 ? (
                      <span className="text-xs text-graphite">No roles</span>
                    ) : (
                      roleLabels(p.roles).map((label) => (
                        <span
                          key={label}
                          className="inline-flex h-5.5 items-center rounded-pill border border-ink px-2.5 text-[11px] font-semibold"
                        >
                          {label}
                        </span>
                      ))
                    )}
                  </span>
                  <span className="text-xs text-graphite">{meta[p.id]}</span>
                </span>
                <ChevronRightIcon size={18} className="mt-2 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(show === "invited" ||
        (show === "active" && invitations.length > 0)) && (
        <InvitationList invitations={invitations} lines={invitationLines} />
      )}

      <section
        aria-labelledby="rules-title"
        className="flex flex-col gap-2 rounded-card border border-line p-3.5"
      >
        <h2 id="rules-title" className="text-[13px] font-bold">
          Rules the app always keeps
        </h2>
        <ul className="list-disc pl-4.5 text-xs leading-relaxed text-graphite">
          <li>Nobody changes their own roles.</li>
          <li>
            At least one active approver and one active admin always remain.
          </li>
          <li>
            Approvers never see drafts and never approve a request they prepared
            or executed.
          </li>
          <li>
            Every change is in the audit log, and approvers see it under{" "}
            <b className="text-ink">Role changes</b> on their Approvals page.
          </li>
        </ul>
      </section>

      <p className="text-xs leading-normal text-graphite">
        Nobody is ever deleted: a deactivated person can&rsquo;t sign in, and
        everything they prepared or signed stays on the records.
      </p>

      {inviting && (
        <InviteSheet onClose={() => setInviting(false)} onSent={setSentTo} />
      )}
      {person && (
        <UserSheet
          key={person.id}
          person={person}
          people={people}
          you={you}
          meta={meta[person.id] ?? ""}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
