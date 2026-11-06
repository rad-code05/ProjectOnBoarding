import type { Choice, FormField } from "./fields";

/**
 * Employee or contractor (F24f, decided with Raju 2026-11-06): a required
 * choice in section 2 (form v4.3 on). An employee needs an office; a
 * contractor may have none — "No office" on the form and the record,
 * "Office not set" in the reports — and then picks the country they work
 * from. Pure helpers, shared by the form and its tests.
 */
export const WORKER_TYPES = ["employee", "contractor"] as const;
export type WorkerType = (typeof WORKER_TYPES)[number];

export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  employee: "Employee",
  contractor: "Contractor",
};

/** The two choices, in the order the switch shows them. */
export const WORKER_TYPE_CHOICES: Choice[] = WORKER_TYPES.map((value) => ({
  value,
  label: WORKER_TYPE_LABELS[value],
}));

/** What a contractor without an office is called on the form and record. */
export const NO_OFFICE = "No office";

/** "Employee" / "Contractor" ("" when not chosen yet). */
export function workerTypeLabel(value: string | null | undefined): string {
  return value === "employee" || value === "contractor"
    ? WORKER_TYPE_LABELS[value]
    : "";
}

/**
 * The field as this request needs it: for a contractor the office is
 * optional and says so; with no office, the country asks where they work.
 */
export function fieldFor(
  field: FormField,
  workerType: string,
  officeId: string,
): FormField {
  if (workerType !== "contractor") return field;
  if (field.key === "office") {
    return {
      ...field,
      required: false,
      help_text:
        "A contractor may have no office — reports count “No office” as Office not set.",
    };
  }
  if (field.key === "country" && !officeId) {
    return {
      ...field,
      help_text: "With no office, pick the country they work from.",
    };
  }
  return field;
}

/** Office choices: a contractor can also choose "No office" (= empty). */
export function officeChoicesFor(
  choices: Choice[],
  workerType: string,
): Choice[] {
  return workerType === "contractor"
    ? [{ value: "", label: NO_OFFICE }, ...choices]
    : choices;
}
