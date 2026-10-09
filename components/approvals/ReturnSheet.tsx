"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { returnRequest } from "@/app/(app)/approvals/actions";
import { Button, InlineError, Sheet } from "@/components/ui";
import { FLAGGABLE_SECTIONS } from "@/lib/approvals/decide";

/** "Return to Raju" with sections to fix and a required comment (board: Phone · Return to Raju). */
export function ReturnSheet({
  requestId,
  eyebrow,
  onClose,
}: {
  requestId: string;
  eyebrow: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const commentId = useId();
  const hintId = useId();
  const [sections, setSections] = useState<number[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (n: number) =>
    setSections((all) =>
      all.includes(n) ? all.filter((x) => x !== n) : [...all, n],
    );

  const send = () =>
    start(async () => {
      setError(null);
      const result = await returnRequest({ requestId, comment, sections });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/approvals");
      router.refresh();
    });

  return (
    <Sheet eyebrow={eyebrow} title="Return to Raju" onClose={onClose}>
      <p className="text-[15px] leading-normal">
        Raju&apos;s signature is removed and sections 1–9 open again. He fixes
        them and signs again; it then comes back to you.
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold">
          What needs fixing?{" "}
          <span className="font-normal text-graphite">(optional)</span>
        </legend>
        {FLAGGABLE_SECTIONS.map((section) => (
          <label
            key={section.number}
            className="flex min-h-11 items-center gap-2.5 rounded-field border border-line px-3 text-sm"
          >
            <input
              type="checkbox"
              checked={sections.includes(section.number)}
              onChange={() => toggle(section.number)}
              className="size-4.5 accent-ink"
            />
            {section.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={commentId} className="text-[13px] font-semibold">
          Comment for Raju{" "}
          <span aria-hidden="true" className="text-signal">
            *
          </span>
        </label>
        <textarea
          id={commentId}
          rows={3}
          required
          maxLength={1000}
          aria-describedby={hintId}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="e.g. Figma should be Viewer, not Editor"
          className="resize-none rounded-field border border-field-border px-3 py-2.5 text-base leading-snug outline-none focus:border-ink md:text-sm"
        />
        <span id={hintId} className="text-xs text-graphite">
          Required — Raju sees it on the request; the audit log keeps it.
        </span>
      </div>
      {error && <InlineError live>{error}</InlineError>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          loading={pending}
          disabled={!comment.trim()}
          onClick={send}
        >
          Return to Raju
        </Button>
      </div>
    </Sheet>
  );
}
