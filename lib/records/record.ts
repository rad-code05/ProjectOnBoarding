import type { ChecklistItem } from "@/lib/requests/execution";
import { formatDate } from "@/lib/requests/format";
import {
  EMPLOYMENT_EVENTS,
  TYPE_LABELS,
  countryName,
  personName,
  type RequestType,
} from "@/lib/requests/labels";
import {
  appRows,
  employeeChangeRows,
  equipmentRows,
  keptRows,
  offboardingRows,
  physicalRows,
  type Row,
  type Snapshot,
} from "@/lib/requests/signing";

/**
 * The PDF record (F08, design: PDF record · page 1 / 2). Everything printed
 * comes from here: the approval snapshot (what Moises confirmed), the
 * request's fixed facts and the two signatures. Pure — no database, no files.
 */

/** One applied signature, as printed in section 11. */
export type RecordSignature = {
  section: "it_execution" | "final_confirmation";
  signerName: string;
  /** Server time of the signature (ISO). */
  signedAt: string;
  /** Typed initials, or null when an image was applied. */
  typedText: string | null;
  /** The applied PNG, or null for typed initials. */
  image: Buffer | null;
  /** Raju's note for the approver (signing again after a return). */
  note: string | null;
};

export type RecordInput = {
  /** The approval snapshot — exactly what the approver confirmed. */
  snapshot: Snapshot;
  /** SHA-256 of that snapshot (printed in the footer). */
  fingerprint: string;
  fileName: string;
  /** Company timezone (D3) used for every time on the record. */
  timezone: string;
  /** When the PDF is made (ISO, server time). */
  generatedAt: string;
  /** Facts fixed on the request row (not part of the snapshot). */
  request: {
    priority: string;
    assigneeName: string | null;
    openedAt: string;
    closedAt: string;
  };
  /** Section 9 items for the ticket type (labels for the checks). */
  checklist: ChecklistItem[];
  signatures: RecordSignature[];
};

export type RecordSection = { number: number; title: string; rows: Row[] };

/**
 * The PDF fonts have no "→" glyph: on the record "Viewer → Full" is written
 * "Viewer to Full" (screens keep the arrow).
 */
function inWords(value: string): string {
  return value.replaceAll(" → ", " to ");
}
const arrows = (row: Row): Row => ({ ...row, value: inWords(row.value) });

/** Access change: what the person keeps, as "Slack (kept)" rows. */
function kept(
  snapshot: Snapshot,
  kind: "application" | "equipment" | "access",
): Row[] {
  return keptRows(snapshot, kind).map((row) => ({
    label: `${row.label} (kept)`,
    value: row.value,
  }));
}

/** "2 Oct 2026, 16:05" in the given timezone. */
export function formatInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day}, ${time}`;
}

const dash = (value: string | null | undefined) => value?.trim() || "—";
const join = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");
const humanize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");

export function signatureOf(
  input: RecordInput,
  section: RecordSignature["section"],
): RecordSignature | null {
  return input.signatures.find((s) => s.section === section) ?? null;
}

/** Sections 1–10 as label / value rows (section 11 is drawn separately). */
export function recordSections(input: RecordInput): RecordSection[] {
  const { snapshot, request, timezone } = input;
  const r = snapshot.request;
  const type = r.type as RequestType;
  const at = (iso: string | null | undefined) =>
    iso ? formatInZone(iso, timezone) : "—";
  const it = signatureOf(input, "it_execution");
  const approver = signatureOf(input, "final_confirmation");
  const none = (rows: Row[], empty: string) =>
    rows.length > 0 ? rows : [{ label: empty, value: "—" }];

  return [
    {
      number: 1,
      title: "Ticket information",
      rows: [
        { label: "Ticket type", value: TYPE_LABELS[type] ?? humanize(r.type) },
        { label: "Ticket ID", value: r.ticket_id },
        { label: "Status", value: "Closed" },
        { label: "Priority", value: humanize(request.priority) },
        { label: "Assignee (IT owner)", value: dash(request.assigneeName) },
        {
          label: "Opened / closed",
          value: `${at(request.openedAt)} / ${at(request.closedAt)}`,
        },
      ],
    },
    {
      number: 2,
      title: "User / employee details",
      rows: [
        {
          label: "Employee name",
          value: dash(personName(r.first_name, r.last_name)),
        },
        { label: "Work email", value: dash(r.work_email) },
        { label: "Job title / role", value: dash(r.job_title) },
        { label: "Department / team", value: dash(r.department) },
        {
          label: "Manager / requestor",
          value: `${dash(r.manager_name)} / ${dash(r.requestor_name)}`,
        },
        { label: "Country", value: r.country ? countryName(r.country) : "—" },
        {
          label: "Employment event · effective date",
          value: join(EMPLOYMENT_EVENTS[type], formatDate(r.effective_date)),
        },
        // Access change (F10d): what section 2 was on the previous request.
        ...employeeChangeRows(snapshot).map((row) => ({
          label: `${row.label} (changed)`,
          value: inWords(row.value),
        })),
      ],
    },
    {
      number: 3,
      title: "Final authorization",
      rows: [
        {
          label: "Approver",
          value: approver ? `${approver.signerName} · Approver` : "—",
        },
        { label: "Decision", value: "Approved" },
        { label: "Approval date", value: at(approver?.signedAt) },
      ],
    },
    {
      number: 4,
      title: "Access provisioning method",
      rows: [
        { label: "Method", value: "Custom / exception access" },
        { label: "Role template", value: "—" },
      ],
    },
    {
      number: 5,
      title: "Application access",
      rows: [
        ...none(appRows(snapshot, timezone), "Applications").map(arrows),
        // An offboarding lists everything the person had; an access change
        // lists what they keep; nothing else changes on onboarding.
        ...(type === "offboarding"
          ? []
          : type === "access_modification"
            ? kept(snapshot, "application")
            : [
                { label: "All other catalog applications", value: "No change" },
              ]),
      ],
    },
    {
      number: 6,
      title: "IT equipment",
      rows: [
        ...none(equipmentRows(snapshot, timezone), "Equipment"),
        ...kept(snapshot, "equipment"),
      ],
    },
    {
      number: 7,
      title: "Physical & logical access",
      rows: [
        ...none(
          physicalRows(snapshot, timezone),
          "Physical & logical access",
        ).map(arrows),
        ...kept(snapshot, "access"),
      ],
    },
    {
      number: 8,
      title: "Access removal SLA",
      rows:
        type === "offboarding"
          ? offboardingRows(snapshot, timezone)
          : [
              {
                label: "Applies to",
                value: "Offboarding only — not applicable",
              },
            ],
    },
    {
      number: 9,
      title: "IT execution confirmation",
      rows: [
        ...input.checklist.map((item) => ({
          label: item.label,
          value:
            snapshot.execution?.checks[item.key] === "no_change"
              ? "No changes made"
              : snapshot.execution?.checks[item.key] === "not_needed"
                ? "Not needed"
                : snapshot.execution?.checks[item.key] === true
                  ? "Yes"
                  : "No",
        })),
        {
          label: "Implementation notes",
          value: dash(snapshot.execution?.notes),
        },
        {
          label: "Executed by · date",
          value:
            join(
              snapshot.execution?.executed_by_name ?? null,
              it ? at(it.signedAt) : null,
            ) || "—",
        },
        ...(it?.note
          ? [{ label: "Note for the approver", value: it.note }]
          : []),
      ],
    },
    {
      number: 10,
      title: "Final review & closure",
      rows: [
        { label: "Final reviewer", value: dash(approver?.signerName) },
        { label: "Review date", value: at(approver?.signedAt) },
        { label: "Closure confirmation", value: "Confirmed complete" },
      ],
    },
  ];
}
