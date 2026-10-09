"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  Button,
  ChevronRightIcon,
  InlineError,
  StatusPill,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AccessChoices, OtherApp } from "@/lib/requests/access";
import type { DraftFieldKey } from "@/lib/requests/draft";
import type { EquipmentItem, PhysicalChoices } from "@/lib/requests/equipment";
import type { FormField } from "@/lib/requests/fields";
import type { RequestFormData } from "@/lib/requests/form";
import {
  EMPLOYMENT_EVENTS,
  TYPE_LABELS,
  personName,
} from "@/lib/requests/labels";
import { EXECUTION_EDITABLE, doneCount } from "@/lib/requests/execution";
import { SECTIONS, fillNote, lockedNote } from "@/lib/requests/sections";
import { ChangedElsewhere } from "./ChangedElsewhere";
import { CollapsedSection } from "./CollapsedSection";
import { AccessSection } from "./AccessSection";
import { EquipmentSection } from "./EquipmentSection";
import { ExecutionSection } from "./ExecutionSection";
import { FieldRenderer } from "./FieldRenderer";
import { PhysicalSection } from "./PhysicalSection";
import { ProvisioningSection } from "./ProvisioningSection";
import { SectionNav, type SectionNavItem } from "./SectionNav";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { CancelRequestSheet, StartExecutionSheet } from "./WorkflowSheets";

/** Sections with fields so far; the rest are collapsed rows. */
const FIELD_SECTIONS = [1, 2];

const SECTION_GRIDS: Record<number, string> = {
  1: "md:grid-cols-3 lg:grid-cols-6",
  2: "md:grid-cols-3",
};

function statusText(status: SaveStatus, created: string): string {
  switch (status.kind) {
    case "saving":
      return "Saving…";
    case "saved":
      return `Saved ${status.at} · created ${created}`;
    case "invalid":
      return "Not saved — check the marked fields.";
    case "error":
      return status.message;
    case "conflict":
      return "Not saved";
    default:
      return `Created ${created}`;
  }
}

/**
 * The request form. Fields come from form_fields; the ticket type is the
 * switch at the top. Changes save on their own (useAutosave) and only if
 * nobody saved in between; sections without fields yet are collapsed rows.
 */
export function RequestForm({ form }: { form: RequestFormData }) {
  const { values, saved, errors, status, setValue, saveNow } = useAutosave({
    id: form.id,
    version: form.version,
    values: form.values,
    savedAt: form.savedLabel,
    enabled: form.editable,
  });
  const [openSections, setOpenSections] = useState<number[]>([]);
  const [access, setAccess] = useState<AccessChoices>(form.access);
  const [others, setOthers] = useState<OtherApp[]>(form.others);
  const [equipment, setEquipment] = useState<EquipmentItem[]>(form.equipment);
  const [physical, setPhysical] = useState<PhysicalChoices>(form.physical);
  const [checks, setChecks] = useState(form.execution.checks);
  const [sheet, setSheet] = useState<"start" | "cancel" | null>(null);
  const started = Boolean(form.workflow.executionStartedLabel);
  const cancellable = [
    "draft",
    "in_execution",
    "pending_confirmation",
    "returned",
  ].includes(form.state);
  const conflict = status.kind === "conflict";
  const disabled = !form.editable || conflict;

  const toggle = (number: number, open?: boolean) =>
    setOpenSections((current) =>
      (open ?? !current.includes(number))
        ? [...new Set([...current, number])]
        : current.filter((n) => n !== number),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saveNow();
  };

  const system: Record<string, string> = {
    ...form.system,
    employment_event: EMPLOYMENT_EVENTS[values.type],
  };
  const valueOf = (field: FormField) =>
    field.field_type === "system"
      ? (system[field.key] ?? "—")
      : (values[field.key as DraftFieldKey] ?? "");
  const fieldsOf = (section: number) =>
    form.fields.filter(
      (field) => field.section === section && field.key !== "type",
    );
  const missing = (section: number) =>
    fieldsOf(section).filter(
      (field) =>
        field.required && field.field_type !== "system" && !valueOf(field),
    ).length;

  const navItems: SectionNavItem[] = SECTIONS.map((section) => {
    const locked = lockedNote(section.number, values.type, started);
    if (section.number === 9 && !locked) {
      const done = doneCount(form.checklist, checks);
      return {
        ...section,
        state: done === form.checklist.length ? "complete" : "todo",
        note: `${done} of ${form.checklist.length} done`,
      };
    }
    if (section.number === 4) {
      return { ...section, state: "complete", note: "Custom / exception" };
    }
    if (section.number === 5) {
      const count = Object.keys(access).length + others.length;
      return {
        ...section,
        state: count > 0 ? "complete" : "empty",
        note: `${count} app${count === 1 ? "" : "s"} set`,
      };
    }
    if (section.number === 6) {
      const count = equipment.length;
      return {
        ...section,
        state: count > 0 ? "complete" : "empty",
        note: count === 1 ? "1 item" : `${count} items`,
      };
    }
    if (section.number === 7) {
      const count = form.physicalTypes.filter((t) => physical[t.id]).length;
      return {
        ...section,
        state: count > 0 ? "complete" : "empty",
        note: `${count} of ${form.physicalTypes.length} set`,
      };
    }
    if (FIELD_SECTIONS.includes(section.number)) {
      const left = missing(section.number);
      return {
        ...section,
        state: left === 0 ? "complete" : "todo",
        note: fillNote(left),
      };
    }
    return locked
      ? { ...section, state: "locked", note: locked }
      : { ...section, state: "empty" };
  });

  const typeField = form.fields.find((field) => field.key === "type");
  const name = personName(values.first_name, values.last_name);
  const subtitle = [name, form.ticketId].filter(Boolean).join(" · ");
  const unsaved = form.fields
    .filter(
      (field) =>
        field.field_type !== "system" &&
        values[field.key as DraftFieldKey] !==
          saved[field.key as DraftFieldKey],
    )
    .map((field) => {
      const value = values[field.key as DraftFieldKey];
      const choice = form.choices[field.key]?.find((c) => c.value === value);
      return { label: field.label, value: choice?.label ?? value };
    });

  return (
    <div className="flex flex-col gap-3.5 md:grid md:grid-cols-[13.5rem_minmax(0,1fr)] md:items-start md:gap-7">
      <div
        data-sticky-bar
        className="sticky top-0 z-20 -mx-4 -mt-6 flex flex-col gap-1 border-b border-line bg-sand px-4 pt-1 md:top-6 md:mx-0 md:mt-0 md:gap-4 md:border-0 md:p-0"
      >
        <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-start">
          <Link
            href="/requests"
            className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold md:h-auto md:text-xs"
          >
            <ChevronRightIcon className="rotate-180" size={18} />
            Requests
          </Link>
          <span className="flex-1" />
          <span className="flex items-center gap-2 md:w-full md:justify-between md:rounded-xl md:border md:border-line md:bg-paper md:p-3">
            <span className="text-[13px] font-bold whitespace-nowrap md:text-xs">
              {form.ticketId}
            </span>
            <StatusPill state={form.state} />
          </span>
        </div>
        <SectionNav items={navItems} onSelect={(n) => toggle(n, true)} />
      </div>

      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-3.5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-4"
      >
        <header className="flex flex-col gap-3.5 md:col-start-1">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
              {form.state === "draft" ? "New request" : "Request"} ·{" "}
              {TYPE_LABELS[values.type]}
            </span>
            <h1 className="font-serif text-[32px] leading-tight tracking-tight">
              {name || "New request"}
            </h1>
            <p
              role="status"
              className={cn(
                "text-[13px] md:text-xs",
                ["invalid", "error", "conflict"].includes(status.kind)
                  ? "font-semibold text-signal"
                  : "text-graphite",
              )}
            >
              {statusText(status, form.createdLabel)}
            </p>
          </div>
          {typeField && (
            <fieldset
              disabled={disabled}
              className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
            >
              <legend className="sr-only">{typeField.label}</legend>
              <div className="inline-flex gap-0.75 rounded-pill border border-line bg-paper p-0.75 whitespace-nowrap">
                {(form.choices.type ?? []).map((choice) => (
                  <label
                    key={choice.value}
                    className="flex h-9.5 cursor-pointer items-center rounded-pill px-3.5 text-[13px] font-medium has-checked:bg-ink has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink md:h-7.5 md:text-xs"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={choice.value}
                      checked={values.type === choice.value}
                      onChange={() => setValue("type", choice.value)}
                      className="sr-only"
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </header>

        {form.state === "cancelled" && (
          <div
            role="note"
            className="flex flex-col gap-1 rounded-card border-2 border-graphite bg-paper px-4 py-3 md:col-span-2"
          >
            <span className="text-sm font-bold">
              Cancelled
              {form.workflow.cancelledLabel
                ? ` · ${form.workflow.cancelledLabel}`
                : ""}
            </span>
            {form.workflow.cancelReason && (
              <span className="text-sm text-graphite">
                Reason: {form.workflow.cancelReason}
              </span>
            )}
          </div>
        )}
        {form.state === "returned" && form.workflow.returnReason && (
          <div
            role="note"
            className="flex flex-col gap-1 rounded-card border-2 border-signal bg-paper px-4 py-3 md:col-span-2"
          >
            <span className="text-sm font-bold text-signal">
              Returned by the approver
            </span>
            <span className="text-sm">{form.workflow.returnReason}</span>
          </div>
        )}
        {conflict && <ChangedElsewhere changes={unsaved} />}
        {status.kind === "error" && (
          <InlineError live className="md:col-span-2">
            {status.message}
          </InlineError>
        )}

        {SECTIONS.map(({ number }) =>
          number === 4 ? (
            <ProvisioningSection key={number} />
          ) : number === 5 ? (
            <AccessSection
              key={number}
              requestId={form.id}
              catalog={form.catalog}
              access={access}
              onAccessChange={setAccess}
              others={others}
              onOthersChange={setOthers}
              disabled={disabled}
            />
          ) : number === 6 ? (
            <EquipmentSection
              key={number}
              requestId={form.id}
              types={form.equipmentTypes}
              items={equipment}
              onItemsChange={setEquipment}
              disabled={disabled}
            />
          ) : number === 7 ? (
            <PhysicalSection
              key={number}
              requestId={form.id}
              types={form.physicalTypes}
              choices={physical}
              onChoicesChange={setPhysical}
              disabled={disabled}
            />
          ) : number === 9 && started ? (
            <ExecutionSection
              key={number}
              requestId={form.id}
              items={form.checklist}
              record={form.execution}
              editable={EXECUTION_EDITABLE.includes(form.state)}
              startedLabel={form.workflow.executionStartedLabel}
              checks={checks}
              onChecksChange={setChecks}
            />
          ) : !FIELD_SECTIONS.includes(number) ? (
            <CollapsedSection
              key={number}
              section={SECTIONS[number - 1]}
              locked={lockedNote(number, values.type, started)}
              note="Not started"
              open={openSections.includes(number)}
              onToggle={() => toggle(number)}
            />
          ) : (
            <section
              key={number}
              id={`s${number}`}
              aria-labelledby={`s${number}-title`}
              className={cn(
                "flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4 md:col-span-2 md:px-5",
                conflict && "opacity-55",
              )}
            >
              <div className="flex items-baseline gap-2.5">
                <span className="text-xs font-semibold text-graphite md:text-[11px]">
                  {String(number).padStart(2, "0")}
                </span>
                <h2
                  id={`s${number}-title`}
                  className="font-serif text-[21px] md:text-[19px]"
                >
                  {SECTIONS[number - 1].title}
                </h2>
                <span className="ml-auto text-xs font-semibold whitespace-nowrap text-graphite md:text-[11px]">
                  {fillNote(missing(number))}
                </span>
              </div>
              <div
                className={cn(
                  "grid grid-cols-2 gap-x-2.5 gap-y-3.5 md:gap-x-3.5",
                  SECTION_GRIDS[number],
                )}
              >
                {fieldsOf(number).map((field) => (
                  <FieldRenderer
                    key={field.key}
                    field={field}
                    value={valueOf(field)}
                    onChange={(value) => setValue(field.key, value)}
                    choices={form.choices[field.key]}
                    error={errors[field.key as DraftFieldKey]}
                    disabled={disabled}
                  />
                ))}
              </div>
            </section>
          ),
        )}

        {cancellable && (
          <div className="flex justify-center md:col-span-2 md:justify-start">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet("cancel")}
              className="h-11 px-3 text-sm font-semibold text-signal underline underline-offset-[3px] md:h-auto md:px-0 md:text-xs"
            >
              Cancel this request…
            </button>
          </div>
        )}

        {form.editable && (
          <div
            data-sticky-bar
            className="sticky bottom-0 order-last -mx-4 grid grid-cols-2 gap-2 border-t border-line bg-sand px-4 pt-3 pb-5 md:static md:order-0 md:col-start-2 md:row-start-1 md:mx-0 md:flex md:border-0 md:p-0"
          >
            <Button
              type="submit"
              variant="secondary"
              disabled={conflict}
              loading={status.kind === "saving"}
            >
              {form.state === "draft" ? "Save draft" : "Save"}
            </Button>
            {form.state === "draft" ? (
              <Button
                disabled={conflict}
                aria-haspopup="dialog"
                onClick={() => setSheet("start")}
              >
                Start execution
              </Button>
            ) : (
              <Button disabled title="Review & sign arrives with F06">
                Review &amp; sign
              </Button>
            )}
          </div>
        )}
      </form>

      {sheet === "start" && (
        <StartExecutionSheet
          requestId={form.id}
          subtitle={subtitle}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "cancel" && (
        <CancelRequestSheet
          requestId={form.id}
          subtitle={subtitle}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
