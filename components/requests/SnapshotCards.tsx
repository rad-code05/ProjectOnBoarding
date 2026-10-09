import { AlertIcon, CheckIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChecklistItem } from "@/lib/requests/execution";
import { formatDay, formatTime } from "@/lib/requests/format";
import {
  accessRows,
  employeeRows,
  type Row,
  type Snapshot,
} from "@/lib/requests/signing";

export const card =
  "flex flex-col gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-3";
export const cardTitle = "font-serif text-[19px]";
export const linkStyle =
  "text-[13px] font-semibold underline underline-offset-2";

export function Rows({
  rows,
  split = false,
}: {
  rows: Row[];
  split?: boolean;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-3.5 gap-y-1.5 text-[13px]",
        split ? "grid-cols-[1fr_auto]" : "grid-cols-[auto_1fr]",
      )}
    >
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className="contents">
          <dt className={split ? "font-semibold" : "text-graphite"}>
            {row.label}
          </dt>
          <dd className={split ? "text-right text-graphite" : "font-semibold"}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The mark that was (or will be) applied: a PNG or typed initials. */
export function SignatureMark({
  imageUrl,
  typedText,
  alt,
  className,
}: {
  imageUrl: string | null;
  typedText: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-19 items-center justify-center rounded-field bg-sand",
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived private link
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-16 max-w-full object-contain"
        />
      ) : typedText ? (
        <span className="font-accent text-[34px] italic">{typedText}</span>
      ) : (
        <span className="text-sm text-graphite">No signature yet</span>
      )}
    </div>
  );
}

function CardHeader({
  id,
  title,
  section,
  onEdit,
}: {
  id: string;
  title: string;
  section: number;
  onEdit?: (section: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 id={id} className={cardTitle}>
        {title}
      </h3>
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(section)}
          className={linkStyle}
        >
          Edit
        </button>
      )}
    </div>
  );
}

/**
 * What is (being) signed, from the snapshot: Employee, Access & equipment and
 * section 9. Used by Review & sign (with Edit) and the approver's pages.
 */
export function SnapshotCards({
  snapshot,
  checklist,
  onEdit,
  idPrefix = "snap",
}: {
  snapshot: Snapshot;
  checklist: ChecklistItem[];
  onEdit?: (section: number) => void;
  idPrefix?: string;
}) {
  const execution = snapshot.execution;
  const started = snapshot.request.execution_started_at;
  const access = accessRows(snapshot);
  return (
    <>
      <div className="flex flex-col gap-3.5 md:grid md:grid-cols-2">
        <section aria-labelledby={`${idPrefix}-employee`} className={card}>
          <CardHeader
            id={`${idPrefix}-employee`}
            title="Employee"
            section={2}
            onEdit={onEdit}
          />
          <Rows rows={employeeRows(snapshot)} />
        </section>

        <section aria-labelledby={`${idPrefix}-access`} className={card}>
          <CardHeader
            id={`${idPrefix}-access`}
            title="Access & equipment"
            section={5}
            onEdit={onEdit}
          />
          {access.length > 0 ? (
            <Rows rows={access} split />
          ) : (
            <p className="text-[13px] text-graphite">Nothing requested.</p>
          )}
        </section>
      </div>

      <section aria-labelledby={`${idPrefix}-it`} className={card}>
        <CardHeader
          id={`${idPrefix}-it`}
          title="9 · IT execution"
          section={9}
          onEdit={onEdit}
        />
        <span className="-mt-1.5 text-xs text-graphite">
          Executed by {execution?.executed_by_name ?? "—"}
          {started
            ? ` · started ${formatDay(started)}, ${formatTime(started)}`
            : ""}
        </span>
        <ul className="flex flex-col gap-2 text-[13px]">
          {checklist.map((item) => {
            const done = Boolean(execution?.checks[item.key]);
            return (
              <li key={item.key} className="flex items-start gap-2">
                {done ? (
                  <CheckIcon size={16} className="mt-px shrink-0" />
                ) : (
                  <AlertIcon size={16} className="mt-px shrink-0 text-signal" />
                )}
                <span className={cn(!done && "text-signal")}>
                  {item.label}
                  {!done && " — not ticked"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[13px] text-graphite">
          <span className="font-semibold text-ink">Notes: </span>
          {execution?.notes || "—"}
        </p>
      </section>
    </>
  );
}
