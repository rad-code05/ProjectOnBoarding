"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonStyles } from "@/components/ui";
import { deleteCustomReport } from "@/app/(app)/reports/actions";

/**
 * Delete a custom report (board: Custom report page): one tap asks, the
 * second deletes and goes back to Reports. Recorded in the audit log.
 */
export function DeleteCustomReport({ id }: { id: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={buttonStyles("secondary", "md")}
      >
        Delete
      </button>
    );
  return (
    <div
      role="group"
      aria-label="Delete this report?"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-sm">Delete this report?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (await deleteCustomReport(id)) {
              router.push("/reports");
              router.refresh();
            } else setFailed(true);
          })
        }
        className={buttonStyles("primary", "md")}
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsking(false)}
        className={buttonStyles("secondary", "md")}
      >
        Cancel
      </button>
      {failed && (
        <p role="alert" className="w-full text-sm text-signal">
          Could not delete the report. Try again.
        </p>
      )}
    </div>
  );
}
