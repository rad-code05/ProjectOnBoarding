"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  Button,
  CheckIcon,
  ChevronRightIcon,
  InlineError,
  StatusPill,
  Toast,
} from "@/components/ui";
import { addOfficeCity } from "@/app/(app)/admin/actions";
import {
  acceptSuggestion,
  rejectSuggestion,
} from "@/app/(app)/requests/suggestion-actions";
import { setWaitingSuggestions } from "@/lib/ai/suggestion-badge";
import { cn } from "@/lib/cn";
import {
  cityChoices,
  placeChanges,
  placeWas,
  regionChoices,
  regionName,
  usesRegions,
} from "@/lib/requests/places";
import type { AccessChoices, OtherApp } from "@/lib/requests/access";
import type { HeldItem } from "@/lib/requests/access-change";
import type { DraftFieldKey } from "@/lib/requests/draft";
import type { EquipmentItem, PhysicalChoices } from "@/lib/requests/equipment";
import type { FormField } from "@/lib/requests/fields";
import type { RequestFormData } from "@/lib/requests/form";
import {
  countryName,
  EMPLOYMENT_EVENTS,
  TYPE_LABELS,
  personName,
} from "@/lib/requests/labels";
import { EXECUTION_EDITABLE, doneCount } from "@/lib/requests/execution";
import { flagLabel } from "@/lib/requests/returned";
import { SECTIONS, fillNote, lockedNote } from "@/lib/requests/sections";
import { ChangedElsewhere } from "./ChangedElsewhere";
import { CollapsedSection } from "./CollapsedSection";
import { AccessSection } from "./AccessSection";
import { HeldSection, InventoryNote } from "./AccessChangeSections";
import { EquipmentSection } from "./EquipmentSection";
import { ExecutionSection } from "./ExecutionSection";
import { FieldRenderer, phoneSpan } from "./FieldRenderer";
import {
  HandoverSection,
  PrefillBanner,
  RemovalSections,
  SlaSection,
} from "./OffboardingSections";
import { MailboxChoice, WorkRemovalSections } from "./OffboardingWork";
import { PhysicalSection } from "./PhysicalSection";
import { SlaPanel } from "./SlaPanel";
import type { SlaTimeline } from "@/lib/requests/offboarding";
import { ProvisioningSection } from "./ProvisioningSection";
import { ReturnedCard, SectionFlag, sectionFrame } from "./ReturnedCard";
import { SectionNav, type SectionNavItem } from "./SectionNav";
import { ReviewSignSheet } from "./ReviewSignSheet";
import { SignaturesSection } from "./SignaturesSection";
import {
  SuggestedField,
  SuggestedItems,
  SuggestionsBanner,
} from "./Suggestions";
import { useAutosave, type SaveOutcome, type SaveStatus } from "./useAutosave";
import { CancelRequestSheet, StartExecutionSheet } from "./WorkflowSheets";

/** Sections with fields so far; the rest are collapsed rows. */
const FIELD_SECTIONS = [1, 2];

const SECTION_GRIDS: Record<number, string> = {
  1: "md:grid-cols-3 lg:grid-cols-6",
  2: "md:grid-cols-3",
};

/** Labels of the offboarding fields (they aren't form_fields). */
const OFFBOARDING_LABELS: Record<string, string> = {
  sla_timeline: "Timeline",
  last_working_day: "Last working day",
  cutoff_date: "Access cut-off date",
  cutoff_time: "Cut-off time",
  handover_to: "Data & mailbox go to",
  sla_missed_reason: "Why was the SLA missed?",
};

function statusText(
  status: SaveStatus,
  created: string,
  /** Fields that stop the save (a wrong email, date…). */
  invalidFields: string[] = [],
): string {
  switch (status.kind) {
    case "saving":
      return "Saving…";
    case "saved":
      return status.confirmed
        ? `All changes saved ${status.at} — you can leave and continue later`
        : `Saved ${status.at} · created ${created}`;
    case "invalid":
      // Name the field: one wrong value pauses the whole save (2026-10-13).
      return invalidFields.length > 0
        ? `Not saved — check ${invalidFields.join(", ")}.`
        : "Not saved — check the marked fields.";
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
export function RequestForm({
  form,
  canSign,
  canAddCities = false,
}: {
  form: RequestFormData;
  /** IT operator or admin: may open Review & sign. */
  canSign: boolean;
  /** Admin: a city missing from the City list can be added right there. */
  canAddCities?: boolean;
}) {
  const router = useRouter();
  const { values, saved, errors, status, setValue, saveNow, exclusive, adopt } =
    useAutosave({
      id: form.id,
      version: form.version,
      values: form.values,
      savedAt: form.savedLabel,
      enabled: form.editable,
      timeZone: form.timezone,
    });
  const [openSections, setOpenSections] = useState<number[]>([]);
  const [access, setAccess] = useState<AccessChoices>(form.access);
  const [others, setOthers] = useState<OtherApp[]>(form.others);
  const [equipment, setEquipment] = useState<EquipmentItem[]>(form.equipment);
  const [physical, setPhysical] = useState<PhysicalChoices>(form.physical);
  const [checks, setChecks] = useState(form.execution.checks);
  // Sections 5–7 keep their rows locally (each change saves at once); a
  // refresh (e.g. an accepted suggestion added a row) brings the server's.
  const [loaded, setLoaded] = useState(form);
  if (loaded !== form) {
    setLoaded(form);
    setAccess(form.access);
    setOthers(form.others);
    setEquipment(form.equipment);
    setPhysical(form.physical);
  }
  // F16b: the assistant's suggestions still waiting (decided ones hide at once).
  const [decided, setDecided] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestMessage, setSuggestMessage] = useState<string | null>(null);
  // Access change (F10c): what they hold, each kept / changed / removed.
  const change = form.accessChange;
  const [held, setHeld] = useState<HeldItem[]>(change?.held ?? []);
  const [sheet, setSheet] = useState<"start" | "cancel" | "sign" | null>(null);
  const started = Boolean(form.workflow.executionStartedLabel);
  const cancellable = [
    "draft",
    "in_execution",
    "pending_confirmation",
    "returned",
  ].includes(form.state);
  const conflict = status.kind === "conflict";
  const flag = (number: number) => flagLabel(form.returned, number);
  const disabled = !form.editable || conflict;
  const off = form.offboarding;
  const removalEdit = {
    requestId: form.id,
    catalog: form.catalog,
    equipmentTypes: form.equipmentTypes,
    physicalTypes: form.physicalTypes,
  };

  const fieldSuggestions = form.editable
    ? form.suggestions.fields.filter((f) => !decided.includes(f.id))
    : [];
  const itemSuggestions = form.editable
    ? form.suggestions.items.filter((i) => !decided.includes(i.id))
    : [];
  const waiting = fieldSuggestions.length + itemSuggestions.length;
  // The robot's badge counts what still waits on this request.
  useEffect(() => {
    setWaitingSuggestions(waiting);
    return () => setWaitingSuggestions(0);
  }, [waiting]);
  const itemsOf = (kind: "access" | "equipment" | "physical") =>
    itemSuggestions.filter((i) => i.kind === kind);

  /** Accept or reject one suggestion; false (and a message) when refused. */
  const decideOne = async (id: string, accept: boolean) => {
    const field = form.suggestions.fields.find((f) => f.id === id);
    const result = await exclusive(async () => {
      const outcome = accept
        ? await acceptSuggestion(id)
        : await rejectSuggestion(id);
      if (outcome.ok && accept && field) adopt(outcome.version, field.patch);
      return outcome;
    });
    if (result.ok) setDecided((current) => [...current, id]);
    else setSuggestMessage(result.message);
    return result.ok;
  };
  const decide = async (ids: string[], accept: boolean) => {
    setSuggestBusy(true);
    setSuggestMessage(null);
    for (const id of ids) {
      if (!(await decideOne(id, accept))) break;
    }
    setSuggestBusy(false);
    router.refresh();
  };
  const allWaiting = () => [
    ...fieldSuggestions.map((f) => f.id),
    ...itemSuggestions.map((i) => i.id),
  ];
  const showNext = () => {
    const next = document.querySelector<HTMLElement>("[data-suggestion]");
    if (!next) return;
    const section = next.closest<HTMLElement>("section[id^=s]");
    const number = Number(section?.id.slice(1));
    if (number) toggle(number, true);
    next.scrollIntoView({ behavior: "smooth", block: "center" });
    next.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
  };

  const toggle = (number: number, open?: boolean) =>
    setOpenSections((current) =>
      (open ?? !current.includes(number))
        ? [...new Set([...current, number])]
        : current.filter((n) => n !== number),
    );

  // Save what's typed first, so the database sees the latest data (e.g. a
  // cut-off typed a second ago) before execution starts.
  const openStart = async () => {
    await saveNow();
    setSheet("start");
  };
  const slaMissing = off
    ? [
        [values.sla_timeline, "timeline"],
        [values.last_working_day, "last working day"],
        [values.cutoff_date, "cut-off date"],
        [values.cutoff_time, "cut-off time"],
      ]
        .filter(([value]) => !value)
        .map(([, label]) => label as string)
    : [];

  // Save what's typed first, so the review shows the latest data.
  const openReview = async () => {
    await saveNow();
    setSheet("sign");
  };

  // "Edit" / "Fix" in the review: close it and open that section.
  const editSection = (number: number) => {
    setSheet(null);
    toggle(number, true);
    requestAnimationFrame(() =>
      document
        .getElementById(`s${number}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // Pressing Save says so (Raju, 2026-10-15): the button turns solid with a
  // tick for two seconds and a pop-up confirms — or says what went wrong.
  const [toast, setToast] = useState<{
    tone: "ok" | "error";
    text: string;
    id: number;
  } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const closeToast = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const problem = (result: Exclude<SaveOutcome, { ok: true }>): string => {
    if (result.reason === "invalid") {
      const labels = result.fields.map(
        (key) =>
          form.fields.find((field) => field.key === key)?.label ??
          OFFBOARDING_LABELS[key] ??
          key.replaceAll("_", " "),
      );
      return `Not saved — check ${labels.join(", ")}.`;
    }
    if (result.reason === "conflict") {
      return "Not saved — this request was changed somewhere else. Reload to see the latest version.";
    }
    return result.message;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await saveNow();
    if (result.ok) {
      setJustSaved(true);
      setToast({
        tone: "ok",
        text:
          form.state === "draft"
            ? "Draft saved — you can leave and continue later"
            : "Changes saved",
        id: Date.now(),
      });
    } else {
      setToast({ tone: "error", text: problem(result), id: Date.now() });
    }
  };

  const system: Record<string, string> = {
    ...form.system,
    employment_event: EMPLOYMENT_EVENTS[values.type],
  };
  const valueOf = (field: FormField) =>
    field.field_type === "system"
      ? (system[field.key] ?? "—")
      : (values[field.key as DraftFieldKey] ?? "");
  // Access change: section 2 as it was on the previous request ("Was: …").
  const wasOf = (field: FormField): string | null => {
    const prev = change?.previous;
    if (!prev) return null;
    const now = values[field.key as DraftFieldKey] ?? "";
    const place = placeWas(field.key, now, prev);
    if (place !== null) return place;
    if (
      field.key === "job_title" ||
      field.key === "manager_name" ||
      field.key === "requestor_name"
    ) {
      return (prev[field.key] ?? "") !== now ? prev[field.key] || "—" : null;
    }
    if (field.key === "department") {
      return String(prev.department_id ?? "") !== now
        ? prev.department || "—"
        : null;
    }
    if (field.key === "country") {
      return (prev.country ?? "") !== now
        ? prev.country
          ? countryName(prev.country)
          : "—"
        : null;
    }
    return null;
  };
  const heldProps = {
    requestId: form.id,
    firstName: values.first_name ?? "",
    items: held,
    onItemsChange: setHeld,
    disabled,
  };
  // F27: State and City only for an office that asks for them (the US).
  const officeId = values.office ?? "";
  const regionId = values.region ?? "";
  const fieldsOf = (section: number) =>
    form.fields.filter(
      (field) =>
        field.section === section &&
        field.key !== "type" &&
        ((field.key !== "region" && field.key !== "office_city") ||
          usesRegions(form.places, officeId)),
    );
  const setField = (key: string, value: string) => {
    for (const [k, v] of Object.entries(
      placeChanges(form.places, key, value),
    )) {
      setValue(k, v);
    }
  };
  const choicesOf = (field: FormField) =>
    field.key === "region"
      ? regionChoices(form.places, officeId)
      : field.key === "office_city"
        ? cityChoices(form.places, officeId, regionId, values.office_city ?? "")
        : form.choices[field.key];
  const state = regionName(form.places, regionId);
  const [cityError, setCityError] = useState<string | null>(null);
  const searchProps = (field: FormField) => {
    if (field.key !== "office_city") return {};
    return {
      noMatch: (q: string) =>
        !regionId
          ? "Choose the state first"
          : q
            ? `No city in ${state} matches “${q}”`
            : `No cities in ${state} yet`,
      create:
        canAddCities && regionId
          ? {
              label: (q: string) => `Add “${q}” to ${state}`,
              onCreate: (q: string) => {
                setCityError(null);
                void addOfficeCity({
                  officeId: Number(officeId),
                  regionId: Number(regionId),
                  name: q,
                }).then((result) => {
                  if (!result.ok) {
                    setCityError(result.message);
                    return;
                  }
                  setValue("office_city", String(result.id));
                  router.refresh();
                });
              },
            }
          : undefined,
    };
  };
  const missing = (section: number) =>
    fieldsOf(section).filter(
      (field) =>
        field.required && field.field_type !== "system" && !valueOf(field),
    ).length;

  const navItems: SectionNavItem[] = SECTIONS.map((section) => {
    const item = navItem(section);
    const flagged = flag(section.number);
    return flagged ? { ...item, flagged: true, note: flagged } : item;
  });

  function navItem(section: (typeof SECTIONS)[number]): SectionNavItem {
    const locked = lockedNote(section.number, values.type, started);
    if (off && [5, 6, 7, 8].includes(section.number)) {
      if (section.number === 8) {
        const set =
          values.sla_timeline && values.last_working_day && values.cutoff_date;
        return {
          ...section,
          state: set ? "complete" : "todo",
          note: set ? "Set" : "To fill",
        };
      }
      const count = {
        5: off.removals.apps.length,
        6: off.removals.equipment.length,
        7: off.removals.access.length,
      }[section.number as 5 | 6 | 7];
      const verb = { 5: "to remove", 6: "to return", 7: "to disable" }[
        section.number as 5 | 6 | 7
      ];
      if (started) {
        const done = {
          5: off.removals.apps.filter((a) => a.doneAt).length,
          6: off.removals.equipment.filter((e) => e.status !== "pending")
            .length,
          7: off.removals.access.filter((a) => a.doneAt).length,
        }[section.number as 5 | 6 | 7];
        return {
          ...section,
          state: done === count ? "complete" : "todo",
          note: `${done} of ${count} done`,
        };
      }
      return {
        ...section,
        state: count > 0 ? "complete" : "empty",
        note: `${count} ${verb}`,
      };
    }
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
  }

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
              {statusText(
                status,
                form.createdLabel,
                Object.keys(errors).map(
                  (key) =>
                    form.fields.find((field) => field.key === key)?.label ??
                    OFFBOARDING_LABELS[key] ??
                    key,
                ),
              )}
            </p>
          </div>
          {typeField && (form.choices.type ?? []).length > 1 && (
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
        {form.returned && (
          <ReturnedCard info={form.returned} onGoTo={editSection} />
        )}
        {waiting > 0 && !disabled && (
          <SuggestionsBanner
            total={waiting}
            busy={suggestBusy}
            message={suggestMessage}
            onAcceptAll={() => void decide(allWaiting(), true)}
            onRejectAll={() => void decide(allWaiting(), false)}
            onNext={showNext}
          />
        )}
        {conflict && <ChangedElsewhere changes={unsaved} />}
        {status.kind === "error" && (
          <InlineError live className="md:col-span-2">
            {status.message}
          </InlineError>
        )}

        {change && (
          <InventoryNote firstName={values.first_name ?? ""} held={held} />
        )}

        {off && (
          <>
            {started && off.dueAt ? (
              <SlaPanel
                dueAt={off.dueAt}
                sla={off.sla}
                timeline={(values.sla_timeline || null) as SlaTimeline | null}
                cutoffDate={values.cutoff_date ?? ""}
                cutoffTime={values.cutoff_time ?? ""}
                lastWorkingDay={values.last_working_day ?? ""}
                companyTimezone={off.companyTimezone}
                reason={values.sla_missed_reason ?? ""}
                onReasonChange={(value) => setValue("sla_missed_reason", value)}
                reasonError={errors.sla_missed_reason}
                disabled={disabled}
                flag={flag(8)}
              />
            ) : (
              <SlaSection
                values={values}
                setValue={setValue}
                errors={errors}
                disabled={disabled}
                fixed={form.state !== "draft"}
                companyTimezone={off.companyTimezone}
                dueAt={off.dueAt}
                flag={flag(8)}
              />
            )}
            <PrefillBanner removals={off.removals} />
          </>
        )}

        {SECTIONS.map(({ number }) =>
          off && [4, 6, 7, 8].includes(number) ? null : off && number === 5 ? (
            <Fragment key={number}>
              {started ? (
                <WorkRemovalSections
                  removals={off.removals}
                  editable={
                    EXECUTION_EDITABLE.includes(form.state) && !conflict
                  }
                  timeZone={form.timezone}
                  flag={flag}
                  edit={removalEdit}
                />
              ) : (
                <RemovalSections
                  removals={off.removals}
                  flag={flag}
                  edit={disabled ? undefined : removalEdit}
                />
              )}
              <HandoverSection
                values={values}
                setValue={setValue}
                errors={errors}
                disabled={disabled}
              >
                {started && (
                  <MailboxChoice
                    requestId={form.id}
                    handling={off.mailbox.handling}
                    recordedAt={off.mailbox.recordedAt}
                    editable={
                      EXECUTION_EDITABLE.includes(form.state) && !conflict
                    }
                    timeZone={form.timezone}
                  />
                )}
              </HandoverSection>
            </Fragment>
          ) : number === 4 ? (
            <ProvisioningSection key={number} />
          ) : number === 5 ? (
            <Fragment key={number}>
              {change && <HeldSection kind="application" {...heldProps} />}
              {!disabled && (
                <SuggestedItems
                  items={itemsOf("access")}
                  busy={suggestBusy}
                  onAccept={(id) => void decide([id], true)}
                  onReject={(id) => void decide([id], false)}
                />
              )}
              <AccessSection
                requestId={form.id}
                catalog={form.catalog}
                access={access}
                onAccessChange={setAccess}
                others={others}
                onOthersChange={setOthers}
                otherActions={form.otherActions}
                flag={flag(number)}
                disabled={disabled}
              />
            </Fragment>
          ) : number === 6 ? (
            <Fragment key={number}>
              {change && <HeldSection kind="equipment" {...heldProps} />}
              {!disabled && (
                <SuggestedItems
                  items={itemsOf("equipment")}
                  busy={suggestBusy}
                  onAccept={(id) => void decide([id], true)}
                  onReject={(id) => void decide([id], false)}
                />
              )}
              <EquipmentSection
                requestId={form.id}
                types={form.equipmentTypes}
                items={equipment}
                onItemsChange={setEquipment}
                flag={flag(number)}
                disabled={disabled}
              />
            </Fragment>
          ) : number === 7 ? (
            <Fragment key={number}>
              {change && <HeldSection kind="access" {...heldProps} />}
              {!disabled && (
                <SuggestedItems
                  items={itemsOf("physical")}
                  busy={suggestBusy}
                  onAccept={(id) => void decide([id], true)}
                  onReject={(id) => void decide([id], false)}
                />
              )}
              <PhysicalSection
                requestId={form.id}
                types={form.physicalTypes}
                choices={physical}
                onChoicesChange={setPhysical}
                flag={flag(number)}
                disabled={disabled}
              />
            </Fragment>
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
              flag={flag(number)}
            />
          ) : number === 11 && form.signatures.length > 0 ? (
            <SignaturesSection
              key={number}
              signatures={form.signatures}
              state={form.state}
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
                "flex flex-col gap-3.5 rounded-card bg-paper p-4 md:col-span-2 md:px-5",
                sectionFrame(flag(number)),
                conflict && "opacity-55",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-xs font-semibold text-graphite md:text-[11px]">
                  {String(number).padStart(2, "0")}
                </span>
                <h2
                  id={`s${number}-title`}
                  className="font-serif text-[21px] md:text-[19px]"
                >
                  {SECTIONS[number - 1].title}
                </h2>
                <SectionFlag label={flag(number)} />
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
                {fieldsOf(number).map((field) => {
                  const suggestion = disabled
                    ? undefined
                    : fieldSuggestions.find((f) => f.key === field.key);
                  return suggestion ? (
                    <SuggestedField
                      key={field.key}
                      label={field.label}
                      suggestion={suggestion}
                      busy={suggestBusy}
                      onAccept={() => void decide([suggestion.id], true)}
                      onReject={() => void decide([suggestion.id], false)}
                      className={phoneSpan(field)}
                    />
                  ) : (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={valueOf(field)}
                      onChange={(value) => setField(field.key, value)}
                      choices={choicesOf(field)}
                      error={
                        errors[field.key as DraftFieldKey] ??
                        (field.key === "office_city"
                          ? (cityError ?? undefined)
                          : undefined)
                      }
                      disabled={disabled}
                      was={wasOf(field)}
                      {...searchProps(field)}
                    />
                  );
                })}
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
              variant={justSaved ? "primary" : "secondary"}
              iconLeft={justSaved ? <CheckIcon size={16} /> : undefined}
              disabled={conflict}
              loading={status.kind === "saving"}
            >
              {justSaved
                ? "Saved"
                : form.state === "draft"
                  ? "Save draft"
                  : "Save"}
            </Button>
            {form.state === "draft" ? (
              <Button
                disabled={conflict}
                aria-haspopup="dialog"
                onClick={() => void openStart()}
              >
                Start execution
              </Button>
            ) : (
              <Button
                disabled={conflict || !canSign}
                title={
                  canSign ? undefined : "Only an IT operator signs section 9"
                }
                aria-haspopup="dialog"
                onClick={() => void openReview()}
              >
                {form.state === "returned"
                  ? "Review & sign again"
                  : "Review & sign"}
              </Button>
            )}
          </div>
        )}
        {toast && (
          <Toast key={toast.id} tone={toast.tone} onClose={closeToast}>
            {toast.text}
          </Toast>
        )}
      </form>

      {sheet === "start" && (
        <StartExecutionSheet
          requestId={form.id}
          subtitle={subtitle}
          missing={slaMissing}
          onFix={() => editSection(8)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "sign" && (
        <ReviewSignSheet
          requestId={form.id}
          eyebrow={[form.ticketId, TYPE_LABELS[values.type]].join(" · ")}
          checklist={form.checklist}
          noteFor={form.returned?.byFirstName ?? null}
          timeZone={form.timezone}
          onEdit={editSection}
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
