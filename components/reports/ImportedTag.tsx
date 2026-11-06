import { importedNote } from "@/lib/reports/imported";

/** The small "Imported" tag on a person in a report (F24d-3). */
export function ImportedTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-pill border border-ink px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
      Imported
    </span>
  );
}

/** The footnote under a list when it shows imported people. */
export function ImportedNote({ count }: { count: number }) {
  const note = importedNote(count);
  if (!note) return null;
  return (
    <p role="note" className="text-xs leading-normal text-graphite">
      <strong className="text-ink">Imported</strong> — {note}
    </p>
  );
}
