"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  invitationLink,
  resendInvitation,
  withdrawInvitation,
} from "@/app/(app)/admin/users/actions";
import { Button, InlineError } from "@/components/ui";
import { roleLabels, type AdminInvitation } from "@/lib/admin/users-shared";

/**
 * Invited · waiting to join (board: Phone · Admin · Users & roles): each open
 * invitation with Send again (a new 7-day link), Copy invitation link (asked
 * from Clerk, for when the email didn't arrive) and Withdraw (asks first).
 */
export function InvitationList({
  invitations,
  lines,
}: {
  invitations: AdminInvitation[];
  lines: Record<string, string>;
}) {
  return (
    <section
      aria-labelledby="invited-title"
      className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5"
    >
      <h2 id="invited-title" className="font-serif text-xl">
        Invited · waiting to join
      </h2>
      {invitations.length === 0 ? (
        <p className="text-[13px] text-graphite">No open invitations.</p>
      ) : (
        <ul aria-label="Invitations" className="flex flex-col">
          {invitations.map((i) => (
            <Invitation key={i.id} invitation={i} line={lines[i.id] ?? ""} />
          ))}
        </ul>
      )}
      <span className="text-xs leading-normal text-graphite">
        The roles are given the moment they accept the email and set their
        password and MFA. Email didn&rsquo;t arrive? Copy the link and send it
        by Teams or WhatsApp — it only works for this email address.
      </span>
    </section>
  );
}

function Invitation({
  invitation: i,
  line,
}: {
  invitation: AdminInvitation;
  line: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const name = `${i.firstName} ${i.lastName}`;

  const run = (
    work: () => Promise<{ ok: boolean; message?: string }>,
    said: string,
  ) =>
    start(async () => {
      setError(null);
      setDone(null);
      const result = await work();
      if (!result.ok) {
        setError(result.message ?? "Could not do that.");
        return;
      }
      setDone(said);
      router.refresh();
    });

  const copy = () =>
    start(async () => {
      setError(null);
      setDone(null);
      const result = await invitationLink({ id: i.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.url);
        setDone(`Link copied — it only works for ${i.email}.`);
      } catch {
        setError("The browser didn't allow copying. Try again.");
      }
    });

  return (
    <li
      aria-label={name}
      className="flex flex-col gap-1.5 border-t border-line-subtle py-3 first:border-t-0 first:pt-0"
    >
      <span className="text-sm font-bold">{name}</span>
      <span className="text-xs break-all text-graphite">
        {i.email} · {roleLabels(i.roles).join(", ")}
      </span>
      <span className="text-xs text-graphite">{line}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => resendInvitation({ id: i.id }),
              `Sent again to ${i.email}.`,
            )
          }
        >
          Send again
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={copy}>
          Copy invitation link
        </Button>
        {confirmWithdraw ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => withdrawInvitation({ id: i.id }), "Withdrawn.")
              }
            >
              Withdraw — the link stops working
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => setConfirmWithdraw(false)}
            >
              Keep it
            </Button>
          </>
        ) : (
          <Button
            variant="text"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmWithdraw(true)}
          >
            Withdraw
          </Button>
        )}
      </div>
      {done && (
        <p role="status" className="text-xs font-semibold">
          ✓ {done}
        </p>
      )}
      {error && <InlineError live>{error}</InlineError>}
    </li>
  );
}
