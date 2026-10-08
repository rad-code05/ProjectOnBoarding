"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { saveDraft } from "@/app/(app)/requests/actions";
import {
  Button,
  ChevronRightIcon,
  InlineError,
  StatusPill,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DraftFieldKey, DraftFormValues } from "@/lib/requests/draft";
import { formatTime } from "@/lib/requests/format";
import type { FormField } from "@/lib/requests/fields";
import type { RequestFormData } from "@/lib/requests/form";
import {
  EMPLOYMENT_EVENTS,
  TYPE_LABELS,
  personName,
} from "@/lib/requests/labels";
import { FieldRenderer } from "./FieldRenderer";

const SECTION_TITLES: Record<number, string> = {
  1: "Ticket information",
  2: "Employee details",
};

const SECTION_GRIDS: Record<number, string> = {
  1: "md:grid-cols-3 lg:grid-cols-6",
  2: "md:grid-cols-3",
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saved"; at: string }
  | { kind: "problem"; message: string; conflict: boolean };

/**
 * The request form (sections 1–2 for now). Fields come from form_fields;
 * the ticket type is shown as the switch at the top, the other fields in
 * their section. Save draft only writes if nobody saved in between.
 */
export function RequestForm({ form }: { form: RequestFormData }) {
  const [values, setValues] = useState<DraftFormValues>(form.values);
  const [version, setVersion] = useState(form.version);
  const [errors, setErrors] = useState<Partial<Record<DraftFieldKey, string>>>(
    {},
  );
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [saving, startSaving] = useTransition();
  const disabled = !form.editable;

  const setValue = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveDraft({ id: form.id, version, values });
      if (result.ok) {
        setVersion(result.version);
        setErrors({});
        setSaveState({ kind: "saved", at: formatTime(result.savedAt) });
      } else if (result.reason === "invalid") {
        setErrors(result.fieldErrors);
        setSaveState({
          kind: "problem",
          message: "Not saved — check the marked fields.",
          conflict: false,
        });
      } else {
        setSaveState({
          kind: "problem",
          message: result.message,
          conflict: result.reason === "conflict",
        });
      }
    });
  };

  const system: Record<string, string> = {
    ...form.system,
    employment_event: EMPLOYMENT_EVENTS[values.type],
  };
  const typeField = form.fields.find((field) => field.key === "type");
  const sections = [1, 2].map((section) => ({
    section,
    fields: form.fields.filter(
      (field) => field.section === section && field.key !== "type",
    ),
  }));
  const name = personName(values.first_name, values.last_name);
  const savedAt =
    saveState.kind === "saved" ? saveState.at : (form.savedLabel ?? null);

  const renderField = (field: FormField) => (
    <FieldRenderer
      key={field.key}
      field={field}
      value={
        field.field_type === "system"
          ? (system[field.key] ?? "—")
          : (values[field.key as DraftFieldKey] ?? "")
      }
      onChange={(value) => setValue(field.key, value)}
      choices={form.choices[field.key]}
      error={errors[field.key as DraftFieldKey]}
      disabled={disabled}
    />
  );

  return (
    <form
      onSubmit={save}
      noValidate
      className="flex flex-col gap-3.5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-4"
    >
      <div className="flex items-center gap-2 md:col-span-2">
        <Link
          href="/requests"
          className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold md:h-auto md:text-xs"
        >
          <ChevronRightIcon className="rotate-180" size={18} />
          Requests
        </Link>
        <span className="flex-1" />
        <span className="text-[13px] font-bold whitespace-nowrap md:text-xs">
          {form.ticketId}
        </span>
        <StatusPill state={form.state} />
      </div>

      <header className="flex flex-col gap-3.5 md:col-start-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
            {form.state === "draft" ? "New request" : "Request"} ·{" "}
            {TYPE_LABELS[values.type]}
          </span>
          <h1 className="font-serif text-[32px] leading-tight tracking-tight">
            {name || "New request"}
          </h1>
          <p role="status" className="text-[13px] text-graphite md:text-xs">
            {saving
              ? "Saving…"
              : savedAt
                ? `Saved ${savedAt} · created ${form.createdLabel}`
                : `Created ${form.createdLabel}`}
          </p>
        </div>
        {typeField && (
          <fieldset
            disabled={disabled}
            className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
          >
            <legend className="sr-only">{typeField.label}</legend>
            <div className="inline-flex gap-[3px] rounded-pill border border-line bg-paper p-[3px] whitespace-nowrap">
              {(form.choices.type ?? []).map((choice) => (
                <label
                  key={choice.value}
                  className="flex h-[38px] cursor-pointer items-center rounded-pill px-3.5 text-[13px] font-medium has-checked:bg-ink has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink md:h-[30px] md:text-xs"
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

      {saveState.kind === "problem" && (
        <div className="flex flex-col items-start gap-2 md:col-span-2">
          <InlineError live>{saveState.message}</InlineError>
          {saveState.conflict && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Load the latest version
            </Button>
          )}
        </div>
      )}

      {sections.map(({ section, fields }) => (
        <section
          key={section}
          aria-labelledby={`s${section}-title`}
          className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4 md:col-span-2 md:px-5"
        >
          <div className="flex items-baseline gap-2.5">
            <span className="text-xs font-semibold text-graphite md:text-[11px]">
              {String(section).padStart(2, "0")}
            </span>
            <h2
              id={`s${section}-title`}
              className="font-serif text-[21px] md:text-[19px]"
            >
              {SECTION_TITLES[section]}
            </h2>
          </div>
          <div
            className={cn(
              "grid grid-cols-2 gap-x-2.5 gap-y-3.5 md:gap-x-3.5",
              SECTION_GRIDS[section],
            )}
          >
            {fields.map(renderField)}
          </div>
        </section>
      ))}

      {form.editable && (
        <div className="sticky bottom-0 order-last -mx-4 grid grid-cols-2 gap-2 border-t border-line bg-sand px-4 pt-3 pb-5 md:static md:order-none md:col-start-2 md:row-start-2 md:mx-0 md:flex md:border-0 md:p-0">
          <Button type="submit" variant="secondary" loading={saving}>
            Save draft
          </Button>
          <Button disabled title="Review & sign arrives with F06">
            Review &amp; sign
          </Button>
        </div>
      )}
    </form>
  );
}
