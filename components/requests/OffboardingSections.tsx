"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { DraftFieldKey, DraftFormValues } from "@/lib/requests/draft";
import { formatDay, formatTime } from "@/lib/requests/format";
import {
  TIMELINE_LABELS,
  TIMELINE_RULES,
  removalsSummary,
  slaDeadline,
  type Removals,
  type SlaTimeline,
} from "@/lib/requests/offboarding";
import { AddRemoval, TakeOff, type RemovalEdit } from "./RemovalEditor";
import { SectionFlag, sectionFrame } from "./ReturnedCard";

type Props = {
  values: DraftFormValues;
  setValue: (key: DraftFieldKey, value: string) => void;
  errors: Partial<Record<DraftFieldKey, string>>;
  disabled: boolean;
};

const fieldClass =
  "h-12 min-w-0 rounded-field border bg-paper px-3 text-base md:h-9 md:text-[13px]";

/** "Asia/Dubai" → "Dubai". */
function city(timeZone: string): string {
  return (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ");
}

function Field({
  label,
  error,
  children,
  id,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <span id={`${id}-error`} className="text-xs font-semibold text-signal">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Section 8 (board Phone · Offboarding draft): timeline, last working day and
 * cut-off in the company timezone, with the deadline the database will work
 * out. Fixed once execution starts (`fixed`).
 */
export function SlaSection({
  values,
  setValue,
  errors,
  disabled,
  fixed,
  companyTimezone,
  dueAt,
  flag,
}: Props & {
  fixed: boolean;
  companyTimezone: string;
  /** The saved deadline; the preview follows the typing. */
  dueAt: string | null;
  flag?: string | null;
}) {
  const id = useId();
  const preview = fixed
    ? dueAt
    : slaDeadline(
        values.sla_timeline ?? "",
        values.cutoff_date ?? "",
        values.cutoff_time ?? "",
        companyTimezone,
      );
  const locked = disabled || fixed;
  const timeline = (values.sla_timeline || null) as SlaTimeline | null;
  const err = (key: DraftFieldKey) => errors[key];
  const border = (key: DraftFieldKey) =>
    err(key) ? "border-2 border-signal" : "border-field-border";

  return (
    <section
      id="s8"
      aria-labelledby="s8-title"
      className={cn(
        "flex flex-col gap-3.5 rounded-card bg-paper p-4 md:col-span-2 md:px-5",
        flag ? sectionFrame(flag) : "border-2 border-ink",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          08
        </span>
        <h2 id="s8-title" className="font-serif text-[21px] md:text-[19px]">
          Access removal SLA
        </h2>
        <SectionFlag label={flag} />
        <span className="ml-auto text-xs font-semibold text-graphite md:text-[11px]">
          {fixed ? "Fixed" : "Required"}
        </span>
      </div>

      <fieldset disabled={locked} className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold">
          Remove all access
        </legend>
        <div className="grid grid-cols-3 gap-0.75 rounded-pill bg-sand p-0.75 md:max-w-md">
          {(Object.keys(TIMELINE_LABELS) as SlaTimeline[]).map((value) => (
            <label
              key={value}
              className="flex h-10 cursor-pointer items-center justify-center rounded-pill text-[13px] font-medium has-checked:bg-ink has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink md:h-8 md:text-xs"
            >
              <input
                type="radio"
                name="sla_timeline"
                value={value}
                checked={timeline === value}
                onChange={() => setValue("sla_timeline", value)}
                className="sr-only"
              />
              {TIMELINE_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 md:grid-cols-4 md:gap-x-3.5">
        <div className="col-span-2 md:col-span-1">
          <Field
            id={`${id}-lwd`}
            label="Last working day"
            error={err("last_working_day")}
          >
            <input
              id={`${id}-lwd`}
              type="date"
              value={values.last_working_day ?? ""}
              disabled={locked}
              onChange={(e) => setValue("last_working_day", e.target.value)}
              className={cn(fieldClass, border("last_working_day"))}
            />
          </Field>
        </div>
        <Field
          id={`${id}-cod`}
          label="Access cut-off date"
          error={err("cutoff_date")}
        >
          <input
            id={`${id}-cod`}
            type="date"
            value={values.cutoff_date ?? ""}
            disabled={locked}
            onChange={(e) => setValue("cutoff_date", e.target.value)}
            className={cn(fieldClass, border("cutoff_date"))}
          />
        </Field>
        <Field id={`${id}-cot`} label="Time" error={err("cutoff_time")}>
          <input
            id={`${id}-cot`}
            type="time"
            value={values.cutoff_time ?? ""}
            disabled={locked}
            onChange={(e) => setValue("cutoff_time", e.target.value)}
            className={cn(fieldClass, border("cutoff_time"))}
          />
        </Field>
      </div>

      <div
        role="status"
        className="flex flex-col gap-1 rounded-xl bg-sand px-3.5 py-3"
      >
        <span className="text-xs font-semibold text-graphite">Deadline</span>
        <span className="font-serif text-xl">
          {preview
            ? `${formatDay(preview, companyTimezone)}, ${formatTime(preview, companyTimezone)}`
            : "Set the timeline and the cut-off"}
        </span>
        <span className="text-xs leading-normal text-graphite">
          {city(companyTimezone)} time (company timezone).
          {timeline ? ` ${TIMELINE_RULES[timeline]}.` : ""}{" "}
          {fixed
            ? "Fixed since execution started."
            : "Fixed when execution starts."}
        </span>
      </div>
    </section>
  );
}

/** "Pre-filled from the access inventory: …" */
export function PrefillBanner({ removals }: { removals: Removals }) {
  const empty =
    removals.apps.length +
      removals.equipment.length +
      removals.access.length ===
    0;
  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-3 text-[13px] leading-normal md:col-span-2">
      {empty ? (
        <span>
          Nothing on record for this person yet — add what they have to sections
          5–7.
        </span>
      ) : (
        <span>
          Pre-filled from the <strong>access inventory</strong>:{" "}
          {removalsSummary(removals)} granted on earlier closed requests. Add
          anything else they have.
        </span>
      )}
    </p>
  );
}

function ListSection({
  number,
  title,
  count,
  empty,
  flag,
  footer,
  hint,
  children,
}: {
  number: number;
  title: string;
  count: number;
  empty: string;
  flag?: string | null;
  /** "Add …" while the draft can be changed. */
  footer?: ReactNode;
  /** What happens to these rows after Start execution. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`s${number}`}
      aria-labelledby={`s${number}-title`}
      className={cn(
        "flex flex-col gap-2 rounded-card bg-paper pt-4 pb-2 md:col-span-2",
        sectionFrame(flag),
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2.5 px-4 md:px-5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          {String(number).padStart(2, "0")}
        </span>
        <h2
          id={`s${number}-title`}
          className="font-serif text-[21px] md:text-[19px]"
        >
          {title}
        </h2>
        <SectionFlag label={flag} />
        <span className="ml-auto text-xs font-semibold text-graphite md:text-[11px]">
          {count}
        </span>
      </div>
      {hint && (
        <p className="px-4 text-xs leading-normal text-graphite md:px-5">
          {hint}
        </p>
      )}
      {count === 0 ? (
        <p className="px-4 pb-2 text-sm text-graphite md:px-5">{empty}</p>
      ) : (
        <ul className="border-t border-line-subtle">{children}</ul>
      )}
      {footer}
    </section>
  );
}

function Row({
  name,
  detail,
  tag,
  action,
}: {
  name: string;
  detail: string;
  tag: string;
  /** "Take off" while the draft can be changed. */
  action?: ReactNode;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 border-b border-line-subtle px-4 py-2 last:border-b-0 md:min-h-11 md:px-5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold md:text-[13px]">{name}</span>
        {detail && (
          <span className="truncate text-[13px] text-graphite md:text-xs">
            {detail}
          </span>
        )}
      </span>
      {/* A label, not a button: the work itself happens after Start execution. */}
      <span className="shrink-0 text-xs whitespace-nowrap text-graphite">
        {tag}
      </span>
      {action}
    </li>
  );
}

/**
 * Sections 5–7 of an offboarding draft: what to remove, return and disable.
 * With `edit`, rows can be added and taken off (F09d-4).
 */
export function RemovalSections({
  removals,
  flag,
  edit,
}: {
  removals: Removals;
  flag: (section: number) => string | null;
  edit?: RemovalEdit;
}) {
  return (
    <>
      <ListSection
        number={5}
        title="Applications to remove"
        count={removals.apps.length}
        empty="No applications on record."
        hint="After Start execution you choose Delete, Suspend or Disable for each app and tick it when it's done. Take off anything the person doesn't have."
        flag={flag(5)}
        footer={
          edit && <AddRemoval edit={edit} kind="app" removals={removals} />
        }
      >
        {removals.apps.map((app) => (
          <Row
            key={app.id}
            name={app.name}
            detail={[app.category, app.had ? `had ${app.had}` : null]
              .filter(Boolean)
              .join(" · ")}
            tag="will be removed"
            action={edit && <TakeOff edit={edit} kind="app" row={app} />}
          />
        ))}
      </ListSection>
      <ListSection
        number={6}
        title="Equipment to return"
        count={removals.equipment.length}
        empty="No equipment on record."
        hint="After Start execution you mark each device Received or Not returned."
        flag={flag(6)}
        footer={
          edit && (
            <AddRemoval edit={edit} kind="equipment" removals={removals} />
          )
        }
      >
        {removals.equipment.map((item) => (
          <Row
            key={item.id}
            name={item.name}
            detail={[
              item.assetTag ? `Asset ${item.assetTag}` : null,
              item.description,
            ]
              .filter(Boolean)
              .join(" · ")}
            tag="to return"
            action={edit && <TakeOff edit={edit} kind="equipment" row={item} />}
          />
        ))}
      </ListSection>
      <ListSection
        number={7}
        title="Physical & logical access"
        count={removals.access.length}
        empty="No access on record."
        hint="After Start execution you tick each one when it's disabled or removed."
        flag={flag(7)}
        footer={
          edit && <AddRemoval edit={edit} kind="access" removals={removals} />
        }
      >
        {removals.access.map((row) => (
          <Row
            key={row.id}
            name={row.name}
            detail={row.scope ?? ""}
            tag={`to ${row.action.toLowerCase()}`}
            action={edit && <TakeOff edit={edit} kind="access" row={row} />}
          />
        ))}
      </ListSection>
    </>
  );
}

/** Handover (offboarding only): who gets the data and mailbox. */
export function HandoverSection({
  values,
  setValue,
  errors,
  disabled,
  children,
}: Props & {
  /** During execution: the mailbox choice (F09d). */
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4 md:col-span-2 md:px-5"
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2
          id={`${id}-title`}
          className="font-serif text-[21px] md:text-[19px]"
        >
          Handover
        </h2>
        <span className="ml-auto text-xs font-semibold text-graphite md:text-[11px]">
          Offboarding only
        </span>
      </div>
      <Field
        id={`${id}-to`}
        label="Data & mailbox go to"
        error={errors.handover_to}
      >
        <input
          id={`${id}-to`}
          type="text"
          value={values.handover_to ?? ""}
          disabled={disabled}
          placeholder="e.g. their manager"
          onChange={(e) => setValue("handover_to", e.target.value)}
          className={cn(
            fieldClass,
            "md:max-w-md",
            errors.handover_to
              ? "border-2 border-signal"
              : "border-field-border",
          )}
        />
      </Field>
      <span className="text-xs leading-normal text-graphite">
        Drive, mailbox, GitHub repos and shared files.
        {children
          ? ""
          : " During execution you record whether the mailbox was converted to a shared mailbox."}
      </span>
      {children}
    </section>
  );
}
