"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { setMyTimezone } from "@/app/(app)/profile/actions";
import { InlineError } from "@/components/ui";
import { formatTime } from "@/lib/requests/format";
import { timezoneList } from "@/lib/time/zones";

const DEFAULT = "";

/**
 * My profile → Timezone (F05e, board Phone · My profile): the timezone of my
 * own screens. Saves as soon as one is chosen; "Company default" clears it.
 * The PDF record, ticket numbers, reports and SLAs keep the company timezone.
 */
export function TimezoneCard({
  own,
  company,
}: {
  own: string | null;
  company: string;
}) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(own ?? DEFAULT);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const zones = useMemo(
    () => timezoneList([company, ...(own ? [own] : [])]),
    [company, own],
  );

  const choose = (next: string) => {
    const previous = value;
    setValue(next);
    setError(null);
    setSaved(null);
    start(async () => {
      const result = await setMyTimezone({ timezone: next || null });
      if (!result.ok) {
        setValue(previous);
        setError(result.message);
        return;
      }
      const zone = next || company;
      setSaved(
        `Saved · now ${formatTime(new Date().toISOString(), zone)} in ${zone}`,
      );
      router.refresh();
    });
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
    >
      <h2 id={`${id}-title`} className="font-serif text-[21px]">
        Timezone
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-select`} className="text-[13px] font-semibold">
          Show times on my screens in
        </label>
        <select
          id={`${id}-select`}
          aria-describedby={`${id}-help`}
          value={value}
          disabled={saving}
          onChange={(event) => choose(event.target.value)}
          className="h-12 rounded-field border border-field-border bg-paper px-3 text-base md:h-10 md:max-w-sm md:text-sm"
        >
          <option value={DEFAULT}>Company default — {company}</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <span role="status" className="min-h-4 text-xs font-semibold">
          {saving ? "Saving…" : saved}
        </span>
        {error && <InlineError live>{error}</InlineError>}
      </div>
      <p id={`${id}-help`} className="text-xs leading-normal text-graphite">
        Only your screens change. PDF records, ticket numbers, reports and SLA
        deadlines always use the company timezone ({company}), so everyone sees
        the same record.
      </p>
    </section>
  );
}
