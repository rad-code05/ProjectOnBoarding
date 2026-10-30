"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveLeaverDefaults } from "@/app/(app)/requests/batch/actions";
import {
  Button,
  Combobox,
  InlineError,
  TextField,
  type ComboboxOption,
} from "@/components/ui";
import { MAILBOX_WORDS } from "@/lib/ai/tools/offboarding-shared";
import { readTime } from "@/lib/requests/batch/offboarding";
import { TIMELINE_LABELS } from "@/lib/requests/offboarding";

/**
 * Batch of leavers (board *Phone · Batch of leavers*, F17b-5b): "Same for
 * everyone" — set once for the batch, a row's own cell wins — and the
 * leaver's fields in Fix a row. Values are kept as words ("Within 24h"),
 * which the server reads again (`readDefaults`, `checkLeaverRow`).
 */

/** The choices people pick from (the words the checks read). */
export const LEAVER_CHOICES: Record<string, string[]> = {
  slaTimeline: Object.values(TIMELINE_LABELS),
  removalMethod: ["Delete", "Suspend", "Disable"],
  mailbox: Object.values(MAILBOX_WORDS),
};

const PICKED: { key: string; label: string }[] = [
  { key: "slaTimeline", label: "SLA" },
  { key: "removalMethod", label: "Removal method (every application)" },
  { key: "mailbox", label: "Mailbox" },
];

/** A list's own value that isn't a choice stays visible, marked. */
export function choiceOptions(
  names: string[],
  current?: string,
): ComboboxOption[] {
  const list = names.map((n) => ({ value: n, label: n }));
  return current && !names.includes(current)
    ? [
        { value: current, label: `${current} (from the list — not known)` },
        ...list,
      ]
    : list;
}

function Picked({
  name,
  label,
  value,
  error,
  emptyHint,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  error?: string;
  emptyHint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">{label}</span>
      <Combobox
        ariaLabel={label}
        value={value}
        allowEmpty
        placeholder={emptyHint}
        options={choiceOptions(LEAVER_CHOICES[name], value)}
        invalid={Boolean(error)}
        onChange={onChange}
      />
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}

/** "Same for everyone": saved on the batch, then every row is checked again. */
export function SameForEveryone({
  batchId,
  defaults,
}: {
  batchId: string;
  defaults: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (key: string, value: string) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  };
  const timeWrong = Boolean(values.cutoffTime) && !readTime(values.cutoffTime);

  return (
    <section
      aria-label="Same for everyone"
      className="bg-white flex flex-col gap-3.5 rounded-card border border-line-subtle p-3.5"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold md:text-sm">
          Same for everyone
        </h2>
        <p className="text-xs leading-normal text-graphite">
          Used for every leaver whose row leaves it empty — a row&apos;s own
          cell wins. The cut-off is on each person&apos;s last working day
          unless their row gives another date.
        </p>
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Picked
          name="slaTimeline"
          label="SLA"
          value={values.slaTimeline ?? ""}
          onChange={(v) => set("slaTimeline", v)}
        />
        <TextField
          label="Cut-off time (company time)"
          hint="Like 18:00."
          value={values.cutoffTime ?? ""}
          error={timeWrong ? "Write a time like 18:00" : undefined}
          onChange={(e) => set("cutoffTime", e.target.value)}
        />
        <TextField
          label="Handover"
          hint="Who gets their data and mailbox — or what happens to it."
          value={values.handoverTo ?? ""}
          onChange={(e) => set("handoverTo", e.target.value)}
        />
        {PICKED.slice(1).map((p) => (
          <Picked
            key={p.key}
            name={p.key}
            label={p.label}
            value={values[p.key] ?? ""}
            onChange={(v) => set(p.key, v)}
          />
        ))}
      </div>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          loading={saving}
          disabled={timeWrong}
          onClick={async () => {
            setSaving(true);
            setError(null);
            const r = await saveLeaverDefaults(batchId, values);
            setSaving(false);
            if (!r.ok) return setError(r.message);
            setSaved(true);
            router.refresh();
          }}
        >
          Save for everyone
        </Button>
        {saved && (
          <span role="status" className="text-xs font-semibold">
            ✓ Saved — every row checked again
          </span>
        )}
      </div>
    </section>
  );
}

const LEAVER_TEXT: { key: string; label: string; hint?: string }[] = [
  { key: "person", label: "Name or work email" },
  {
    key: "lastWorkingDay",
    label: "Last working day",
    hint: "Like 2026-11-30 or 30/11/2026.",
  },
  {
    key: "cutoffDate",
    label: "Cut-off date",
    hint: "Empty = the last working day.",
  },
  {
    key: "cutoffTime",
    label: "Cut-off time (company time)",
    hint: "Empty = same for everyone.",
  },
  {
    key: "handoverTo",
    label: "Handover",
    hint: "Empty = same for everyone.",
  },
];

/** A leaver's row in Fix a row: empty = "Same for everyone". */
export function LeaverFields({
  values,
  problem,
  set,
}: {
  values: Record<string, string>;
  problem: (field: string) => string | undefined;
  set: (key: string, value: string) => void;
}) {
  return (
    <>
      {LEAVER_TEXT.map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          hint={f.hint}
          value={values[f.key] ?? ""}
          error={problem(f.key)}
          onChange={(e) => set(f.key, e.target.value)}
        />
      ))}
      {PICKED.map((p) => (
        <Picked
          key={p.key}
          name={p.key}
          label={p.label}
          value={values[p.key] ?? ""}
          error={problem(p.key)}
          emptyHint="Same for everyone"
          onChange={(v) => set(p.key, v)}
        />
      ))}
    </>
  );
}
