"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraft } from "@/app/(app)/requests/actions";
import type { DraftFieldKey, DraftFormValues } from "@/lib/requests/draft";
import { formatTime } from "@/lib/requests/format";

/** Pause after the last keystroke before saving. */
export const AUTOSAVE_DELAY_MS = 1500;

/** What pressing Save ended with (the button and the pop-up say so). */
export type SaveOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid"; fields: string[] }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "error"; message: string };

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  /** `confirmed`: the Save button was pressed and everything is stored. */
  | { kind: "saved"; at: string; confirmed?: boolean }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  /** Saved elsewhere in between — nothing more is saved until reload. */
  | { kind: "conflict" };

const same = (a: DraftFormValues, b: DraftFormValues) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Fresh values from the server (after a refresh) merged with the form: what
 * the person changed since the last save stays theirs, everything else takes
 * the server's value (e.g. the country an accepted office filled in).
 */
export function mergeFresh(
  current: DraftFormValues,
  lastSaved: DraftFormValues,
  fresh: DraftFormValues,
): DraftFormValues {
  const out = { ...fresh };
  for (const key of Object.keys(current) as (keyof DraftFormValues)[]) {
    if (current[key] !== lastSaved[key])
      Object.assign(out, { [key]: current[key] });
  }
  return out;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 100));

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
  timeZone,
}: {
  id: string;
  version: number;
  values: DraftFormValues;
  savedAt: string | null;
  enabled: boolean;
  /** The person's screen timezone (F05e). */
  timeZone?: string;
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
  const valuesRef = useRef(initialValues);
  const propVersion = useRef(version);
  const busy = useRef(false);
  const waiting = useRef<DraftFormValues | null>(null);
  const stopped = useRef(false);
  // How the last save ended — what the Save button reports.
  const outcome = useRef<SaveOutcome>({ ok: true });

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
            outcome.current = { ok: true };
            versionRef.current = result.version;
            savedRef.current = toSave;
            setSaved(toSave);
            setErrors({});
            setStatus({
              kind: "saved",
              at: formatTime(result.savedAt, timeZone),
            });
          } else if (result.reason === "invalid") {
            outcome.current = {
              ok: false,
              reason: "invalid",
              fields: Object.keys(result.fieldErrors),
            };
            setErrors(result.fieldErrors);
            setStatus({ kind: "invalid" });
          } else if (result.reason === "conflict") {
            outcome.current = { ok: false, reason: "conflict" };
            stopped.current = true;
            setStatus({ kind: "conflict" });
          } else {
            outcome.current = {
              ok: false,
              reason: "error",
              message: result.message,
            };
            setStatus({ kind: "error", message: result.message });
          }
        }
        toSave = waiting.current;
        waiting.current = null;
      }
      busy.current = false;
    },
    [id, timeZone],
  );

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  // A refresh brought newer server values (an accepted suggestion, a change
  // the database made): take them, keeping what the person typed since.
  useEffect(() => {
    if (version === propVersion.current) return;
    propVersion.current = version;
    if (version < versionRef.current) return; // older than our own save
    const lastSaved = savedRef.current;
    versionRef.current = version;
    savedRef.current = initialValues;
    setSaved(initialValues);
    setValues((current) => mergeFresh(current, lastSaved, initialValues));
  }, [version, initialValues]);

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

  /**
   * Runs `fn` while no autosave runs (an accepted suggestion saves the same
   * row); a save that came up meanwhile runs right after, with the latest
   * values.
   */
  const exclusive = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      while (busy.current) await pause();
      busy.current = true;
      try {
        return await fn();
      } finally {
        busy.current = false;
        const queued = waiting.current;
        waiting.current = null;
        if (queued) void run(valuesRef.current);
      }
    },
    [run],
  );

  /** A value saved outside the form (an accepted suggestion) and its version. */
  const adopt = useCallback(
    (nextVersion: number | null, patch: Partial<DraftFormValues>) => {
      if (nextVersion !== null) versionRef.current = nextVersion;
      savedRef.current = { ...savedRef.current, ...patch };
      valuesRef.current = { ...valuesRef.current, ...patch };
      setSaved(savedRef.current);
      setValues((current) => ({ ...current, ...patch }));
    },
    [],
  );

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
    exclusive,
    adopt,
    /**
     * The Save button: saves what's waiting, then always says so — even when
     * everything was already saved (it used to look as if nothing happened).
     */
    saveNow: async (): Promise<SaveOutcome> => {
      const wanted = values;
      await run(wanted);
      // An autosave was already running: wait for it (and what it queued).
      while (busy.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const stored = same(wanted, savedRef.current) && !stopped.current;
      if (!stored) {
        return outcome.current.ok
          ? {
              ok: false,
              reason: "error",
              message: "Could not save. Try again.",
            }
          : outcome.current;
      }
      setStatus((current) =>
        current.kind === "saved"
          ? { ...current, confirmed: true }
          : current.kind === "idle"
            ? {
                kind: "saved",
                at: formatTime(new Date().toISOString(), timeZone),
                confirmed: true,
              }
            : current,
      );
      return { ok: true };
    },
  };
}
