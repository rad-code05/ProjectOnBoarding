"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { changeState } from "@/app/(app)/requests/actions";
import { Button, CheckIcon, InlineError, Sheet } from "@/components/ui";

/** Runs a workflow step, then reloads the page data so every section follows. */
function useStep(requestId: string, onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (to: "in_execution" | "cancelled", reason: string | null) =>
    start(async () => {
      const result = await changeState({ requestId, to, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  return { error, pending, run };
}

/** "Start execution?" (design: Phone · Start execution). */
export function StartExecutionSheet({
  requestId,
  subtitle,
  onClose,
}: {
  requestId: string;
  subtitle: string;
  onClose: () => void;
}) {
  const { error, pending, run } = useStep(requestId, onClose);
  return (
    <Sheet eyebrow={subtitle} title="Start execution?" onClose={onClose}>
      <p className="text-[15px] leading-normal">
        You&apos;re starting the IT work for this request.
      </p>
      <ul className="flex flex-col gap-2.5 text-sm leading-snug">
        {[
          "The start time is recorded by the system (now).",
          "Section 9 opens for the checklist and notes.",
          "Sections 1–7 stay editable while you work.",
        ].map((point) => (
          <li key={point} className="flex items-start gap-2.5">
            <CheckIcon size={18} strokeWidth={2} className="mt-px shrink-0" />
            {point}
          </li>
        ))}
      </ul>
      <p className="rounded-field bg-sand px-3 py-2.5 text-[13px] leading-normal text-graphite">
        This step can&apos;t be undone — the start time stays on the record. If
        the request isn&apos;t needed any more, cancel it instead.
      </p>
      {error && <InlineError live>{error}</InlineError>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Not yet
        </Button>
        <Button loading={pending} onClick={() => run("in_execution", null)}>
          Start execution
        </Button>
      </div>
    </Sheet>
  );
}

/** "Cancel this request?" with a required reason (design: Phone · Cancel request). */
export function CancelRequestSheet({
  requestId,
  subtitle,
  onClose,
}: {
  requestId: string;
  subtitle: string;
  onClose: () => void;
}) {
  const reasonId = useId();
  const hintId = useId();
  const [reason, setReason] = useState("");
  const { error, pending, run } = useStep(requestId, onClose);
  return (
    <Sheet eyebrow={subtitle} title="Cancel this request?" onClose={onClose}>
      <p className="text-[15px] leading-normal">
        The request stays in the list as <strong>Cancelled</strong> and can no
        longer be changed. Your name, the time and the reason are recorded.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-xs font-semibold">
          Reason{" "}
          <span aria-hidden="true" className="text-signal">
            *
          </span>
        </label>
        <textarea
          id={reasonId}
          rows={3}
          required
          maxLength={500}
          aria-describedby={hintId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Start date moved, a new request will be made"
          className="resize-none rounded-field border border-field-border px-3 py-2.5 text-base leading-snug outline-none focus:border-ink md:text-sm"
        />
        <span id={hintId} className="text-xs text-graphite">
          Required — Moises and the audit log will see it.
        </span>
      </div>
      {error && <InlineError live>{error}</InlineError>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Keep request
        </Button>
        <Button
          variant="destructive"
          loading={pending}
          disabled={!reason.trim()}
          onClick={() => run("cancelled", reason)}
        >
          Cancel request
        </Button>
      </div>
    </Sheet>
  );
}
