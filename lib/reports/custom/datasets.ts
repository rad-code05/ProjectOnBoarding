/**
 * The data sets of the report language (F17a, PROJECT_PLAN §6.6): what a
 * custom report can be built from, field by field, in plain words. The
 * robot is told this catalogue; the server checks every definition against
 * it. Rows come from the existing report functions with the reader's own
 * access (RLS) — see `load.ts`. Private tables (chats, signature images,
 * settings, the audit log) are never a data set.
 */

/** How a field's values look (and which conditions fit them). */
export type FieldType =
  | "text" // one value
  | "list" // several values (nationalities)
  | "date" // a calendar day, "2026-10-25"
  | "datetime" // a moment (ISO); compared by the company-time day
  | "number"
  | "duration" // seconds; shown in hours / days
  | "boolean";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  /** One line for the robot (what the value means). */
  about?: string;
};

export type DatasetKey =
  "people" | "access" | "requests" | "signatures" | "offboarding_sla";

export type Dataset = {
  key: DatasetKey;
  label: string;
  /** One row per … */
  row: string;
  about: string;
  fields: Field[];
  /** "holds all / any / none of" works on this data set (one row per person). */
  holdings: boolean;
};

/** Where each person works and who they are — shared by several data sets. */
const PERSON: Field[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Work email", type: "text" },
  { key: "department", label: "Department", type: "text" },
  { key: "office", label: "Office", type: "text" },
  {
    key: "state",
    label: "State",
    type: "text",
    about: "US state, US office only",
  },
  {
    key: "city",
    label: "City",
    type: "text",
    about: "US city, US office only",
  },
  {
    key: "country",
    label: "Work country",
    type: "text",
    about: "ISO code, e.g. AE, CH",
  },
  {
    key: "nationalities",
    label: "Nationality",
    type: "list",
    about: "ISO codes, up to two per person (e.g. BD = Bangladeshi)",
  },
];

export const DATASETS: Record<DatasetKey, Dataset> = {
  people: {
    key: "people",
    label: "People today",
    row: "person employed today",
    about:
      "Everyone whose latest onboarding is closed and who has not been offboarded since; placed by their latest closed request.",
    holdings: true,
    fields: [
      ...PERSON,
      {
        key: "onboarded_at",
        label: "Onboarded",
        type: "datetime",
        about: "when the approver closed their onboarding (D16)",
      },
      { key: "ticket", label: "Latest ticket", type: "text" },
      {
        key: "leaving",
        label: "Leaving",
        type: "boolean",
        about: "an offboarding is open for them",
      },
      { key: "leaving_ticket", label: "Leaving ticket", type: "text" },
      {
        key: "holds",
        label: "Holds",
        type: "list",
        about: "what they hold today, as 'Slack · Regular Member'",
      },
    ],
  },
  access: {
    key: "access",
    label: "Access held",
    row: "thing a person holds today (application, device or access)",
    about:
      "Everything held today from closed requests (and the import later); one row per person and item.",
    holdings: false,
    fields: [
      ...PERSON,
      {
        key: "kind",
        label: "Kind",
        type: "text",
        about: "application, equipment or access",
      },
      { key: "item", label: "Item", type: "text", about: "e.g. Slack, Laptop" },
      { key: "category", label: "Category", type: "text" },
      {
        key: "role",
        label: "Role",
        type: "text",
        about: "the permission held",
      },
      { key: "asset_tag", label: "Asset tag", type: "text" },
      { key: "granted_at", label: "Granted", type: "datetime" },
      { key: "granted_ticket", label: "Granted by ticket", type: "text" },
      { key: "leaving", label: "Leaving", type: "boolean" },
    ],
  },
  requests: {
    key: "requests",
    label: "Requests",
    row: "request (onboarding, offboarding or access change)",
    about:
      "Every request the reader may see (approvers: awaiting confirmation, returned and closed); cancelled ones left out.",
    holdings: false,
    fields: [
      { key: "ticket", label: "Ticket", type: "text" },
      {
        key: "type",
        label: "Type",
        type: "text",
        about: "onboarding, offboarding or access_modification",
      },
      {
        key: "status",
        label: "Status",
        type: "text",
        about: "draft, in_execution, pending_confirmation, returned, closed",
      },
      ...PERSON,
      { key: "effective_date", label: "Effective date", type: "date" },
      { key: "last_working_day", label: "Last working day", type: "date" },
      { key: "created_at", label: "Created", type: "datetime" },
      { key: "closed_at", label: "Closed", type: "datetime" },
    ],
  },
  signatures: {
    key: "signatures",
    label: "Signatures",
    row: "request signed by IT",
    about:
      "IT's first Review & sign and the approver's Confirm & sign, with the time to approve between them.",
    holdings: false,
    fields: [
      { key: "ticket", label: "Ticket", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "status", label: "Status", type: "text" },
      ...PERSON,
      { key: "it_signed_at", label: "IT signed", type: "datetime" },
      { key: "it_signed_by", label: "IT signed by", type: "text" },
      { key: "approved_at", label: "Approved", type: "datetime" },
      { key: "approved_by", label: "Approved by", type: "text" },
      {
        key: "time_to_approve",
        label: "Time to approve",
        type: "duration",
        about: "from IT's first Review & sign to Confirm & sign",
      },
      { key: "returns", label: "Times returned", type: "number" },
    ],
  },
  offboarding_sla: {
    key: "offboarding_sla",
    label: "Offboarding SLA",
    row: "offboarding",
    about:
      "Each offboarding's agreed removal deadline against when the last access was actually removed.",
    holdings: false,
    fields: [
      { key: "ticket", label: "Ticket", type: "text" },
      { key: "status", label: "Status", type: "text" },
      ...PERSON,
      {
        key: "timeline",
        label: "Timeline",
        type: "text",
        about: "same_day, within_24h or within_48h",
      },
      { key: "cutoff_at", label: "Access cut-off", type: "datetime" },
      { key: "due_at", label: "Deadline", type: "datetime" },
      { key: "removed_at", label: "Last removal", type: "datetime" },
      {
        key: "result",
        label: "Result",
        type: "text",
        about: "met, missed, open or overdue",
      },
      { key: "missed_reason", label: "Reason missed", type: "text" },
      { key: "removals_total", label: "Removals", type: "number" },
      { key: "removals_done", label: "Removals done", type: "number" },
    ],
  },
};

export const DATASET_KEYS = Object.keys(DATASETS) as DatasetKey[];

/** One field of a data set, or undefined. */
export function fieldOf(dataset: DatasetKey, key: string): Field | undefined {
  return DATASETS[dataset].fields.find((f) => f.key === key);
}

/** A row of any data set: field key → value. */
export type Row = Record<string, string | number | boolean | string[] | null>;
