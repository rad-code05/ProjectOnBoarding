"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraft } from "@/app/(app)/requests/actions";
import type { DraftFieldKey, DraftFormValues } from "@/lib/requests/draft";
import { formatTime } from "@/lib/requests/format";

/** Pause after the last keystroke before saving. */
export const AUTOSAVE_DELAY_MS = 1500;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  /** Saved elsewhere in between — nothing more is saved until reload. */
  | { kind: "conflict" };

const same = (a: DraftFormValues, b: DraftFormValues) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Keeps the form's values and saves them on its own: 1.5 s after the last
 * change, one save at a time (the next one waits and uses the new version),
 * never after a conflict. `saveNow` is the Save draft button.
 */
export function useAutosave({
  id,
  version,
  values: initialValues,
  savedAt,
  enabled,
}: {
  id: string;
  version: number;
  values: DraftFormValues;
  savedAt: string | null;
  enabled: boolean;
}) {
  const [values, setValues] = useState(initialValues);
  const [saved, setSaved] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<DraftFieldKey, string>>>(
    {},
  );
  const [status, setStatus] = useState<SaveStatus>(
    savedAt ? { kind: "saved", at: savedAt } : { kind: "idle" },
  );

  // Read inside the async save; state would be stale there.
  const versionRef = useRef(version);
  const savedRef = useRef(initialValues);
  const busy = useRef(false);
  const waiting = useRef<DraftFormValues | null>(null);
  const stopped = useRef(false);

  const run = useCallback(
    async (first: DraftFormValues) => {
      if (busy.current) {
        waiting.current = first; // saved right after the running save
        return;
      }
      busy.current = true;
      let toSave: DraftFormValues | null = first;
      while (toSave && !stopped.current) {
        if (!same(toSave, savedRef.current)) {
          setStatus({ kind: "saving" });
          const result = await saveDraft({
            id,
            version: versionRef.current,
            values: toSave,
          }).catch(() => ({
            ok: false as const,
            reason: "error" as const,
            message:
              "Could not save. Check your connection — it retries on your next change.",
          }));

          if (result.ok) {
            versionRef.current = result.version;
            savedRef.current = toSave;
            setSaved(toSave);
            setErrors({});
            setStatus({ kind: "saved", at: formatTime(result.savedAt) });
          } else if (result.reason === "invalid") {
            setErrors(result.fieldErrors);
            setStatus({ kind: "invalid" });
          } else if (result.reason === "conflict") {
            stopped.current = true;
            setStatus({ kind: "conflict" });
          } else {
            setStatus({ kind: "error", message: result.message });
          }
        }
        toSave = waiting.current;
        waiting.current = null;
      }
      busy.current = false;
    },
    [id],
  );

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => void run(values), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, enabled, run]);

  // Leaving with unsaved changes asks first (the browser shows its own text).
  useEffect(() => {
    if (!enabled || same(values, saved)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [values, saved, enabled]);

  const setValue = useCallback(
    (key: string, value: string) =>
      setValues((current) => ({ ...current, [key]: value })),
    [],
  );

  return {
    values,
    /** Values the server has — the conflict box lists what differs. */
    saved,
    errors,
    status,
    setValue,
    saveNow: () => run(values),
  };
}
