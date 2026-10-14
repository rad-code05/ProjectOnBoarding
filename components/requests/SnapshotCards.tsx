import { AlertIcon, CheckIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChecklistItem } from "@/lib/requests/execution";
import { formatDay, formatTime } from "@/lib/requests/format";
import {
  accessRows,
  employeeChangeRows,
  employeeRows,
  keptRows,
  offboardingRows,
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
  timeZone,
}: {
  snapshot: Snapshot;
  checklist: ChecklistItem[];
  onEdit?: (section: number) => void;
  idPrefix?: string;
  /** The viewer's screen timezone (F05e). */
  timeZone?: string;
}) {
  const access = accessRows(snapshot, timeZone);
  const offboarding = offboardingRows(snapshot, timeZone);
  // Access change (F10d): what changed in section 2, and what is kept.
  const isChange = Boolean(snapshot.access_modification);
  const employeeChanges = employeeChangeRows(snapshot);
  const kept = keptRows(snapshot);
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
            title={isChange ? "What changes" : "Access & equipment"}
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

      {isChange && (
        <div className="flex flex-col gap-3.5 md:grid md:grid-cols-2">
          <section aria-labelledby={`${idPrefix}-was`} className={card}>
            <CardHeader
              id={`${idPrefix}-was`}
              title="Employee · was → now"
              section={2}
              onEdit={onEdit}
            />
            {employeeChanges.length > 0 ? (
              <Rows rows={employeeChanges} split />
            ) : (
              <p className="text-[13px] text-graphite">
                No change to the employee details.
              </p>
            )}
          </section>
          <section aria-labelledby={`${idPrefix}-kept`} className={card}>
            <CardHeader
              id={`${idPrefix}-kept`}
              title={`Kept unchanged · ${kept.length}`}
              section={5}
              onEdit={onEdit}
            />
            {kept.length > 0 ? (
              <Rows rows={kept} split />
            ) : (
              <p className="text-[13px] text-graphite">
                Nothing else on record.
              </p>
            )}
          </section>
        </div>
      )}

      {offboarding.length > 0 && (
        <section aria-labelledby={`${idPrefix}-sla`} className={card}>
          <CardHeader
            id={`${idPrefix}-sla`}
            title="8 · Access removal SLA & handover"
            section={8}
            onEdit={onEdit}
          />
          <Rows rows={offboarding} split />
        </section>
      )}

      <ExecutionCard
        snapshot={snapshot}
        checklist={checklist}
        onEdit={onEdit}
        idPrefix={idPrefix}
        timeZone={timeZone}
      />
    </>
  );
}

/** Section 9 from the snapshot: who executed it, the checklist, the notes. */
export function ExecutionCard({
  snapshot,
  checklist,
  onEdit,
  idPrefix = "snap",
  timeZone,
}: {
  snapshot: Snapshot;
  checklist: ChecklistItem[];
  onEdit?: (section: number) => void;
  idPrefix?: string;
  /** The viewer's screen timezone (F05e). */
  timeZone?: string;
}) {
  const execution = snapshot.execution;
  const started = snapshot.request.execution_started_at;
  return (
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
          ? ` · started ${formatDay(started, timeZone)}, ${formatTime(started, timeZone)}`
          : ""}
      </span>
      <ul className="flex flex-col gap-2 text-[13px]">
        {checklist.map((item) => {
          const value = execution?.checks[item.key];
          const done = value === true;
          const notNeeded = value === "not_needed";
          return (
            <li key={item.key} className="flex items-start gap-2">
              {done || notNeeded ? (
                <CheckIcon size={16} className="mt-px shrink-0" />
              ) : (
                <AlertIcon size={16} className="mt-px shrink-0 text-signal" />
              )}
              <span className={cn(!done && !notNeeded && "text-signal")}>
                {item.label}
                {notNeeded && " — not needed"}
                {!done && !notNeeded && " — not ticked"}
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
  );
}
