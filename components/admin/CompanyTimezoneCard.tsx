"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { setCompanyTimezone } from "@/app/(app)/admin/actions";
import { Button, InlineError } from "@/components/ui";
import { timezoneList } from "@/lib/time/zones";

/**
 * Admin → Settings → Company timezone (board: Phone · Admin · Settings).
 * Used for new PDF records, ticket numbers, reports and SLAs, and as the
 * screen timezone of everyone who hasn't chosen their own.
 */
export function CompanyTimezoneCard({
  timezone,
  lastChanged,
}: {
  timezone: string;
  lastChanged: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(timezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, start] = useTransition();
  const zones = useMemo(() => timezoneList([timezone]), [timezone]);

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setCompanyTimezone({ timezone: value });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
    >
      <h2 id={`${id}-title`} className="font-serif text-[21px]">
        Company timezone
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-select`} className="text-[13px] font-semibold">
          Timezone
        </label>
        <select
          id={`${id}-select`}
          aria-describedby={`${id}-help`}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          className="h-12 rounded-field border border-field-border bg-paper px-3 text-base md:h-10 md:max-w-sm md:text-sm"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>
      <p id={`${id}-help`} className="text-xs leading-normal text-graphite">
        Used for every new PDF record, ticket numbers (the new year starts at
        midnight in this timezone), reports and SLA deadlines — and as the
        screen timezone of everyone who hasn&apos;t chosen their own. PDFs
        already made keep the timezone printed on them.
      </p>
      {error && <InlineError live>{error}</InlineError>}
      <div className="flex items-center justify-between gap-2.5">
        <span role="status" className="text-xs text-graphite">
          {saved
            ? `Saved · the company timezone is now ${value}`
            : lastChanged
              ? `Last changed by ${lastChanged}`
              : "Not changed yet"}
        </span>
        <Button
          size="sm"
          className="shrink-0"
          disabled={value === timezone}
          loading={saving}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </section>
  );
}
