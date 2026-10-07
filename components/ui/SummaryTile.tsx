export type SummaryTileProps = {
  label: string;
  value: string | number;
  /** Small line under the number, e.g. why it is empty. */
  note?: string;
};

/** A labelled number at the top of a list page. */
export function SummaryTile({ label, value, note }: SummaryTileProps) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-paper px-3.5 py-3 md:px-4 md:py-3.5">
      <span className="text-[11px] font-semibold text-graphite">{label}</span>
      <span className="font-serif text-[26px] leading-tight tabular-nums md:text-[28px]">
        {value}
      </span>
      {note && <span className="text-[11px] text-graphite">{note}</span>}
    </div>
  );
}
