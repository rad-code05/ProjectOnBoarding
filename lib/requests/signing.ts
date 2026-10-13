import * as z from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { formatDate, formatDay, formatTime } from "./format";
import { countryName, personName } from "./labels";
import { splitBlockers } from "./offboarding";

/**
 * Review & sign (F06): what the sheet shows and how its answers are worded.
 * The database decides everything (sign_request); this only presents it.
 */

const text = z.string().nullable();

/** The snapshot as built by private.request_snapshot_data() — read for display only. */
export const snapshotSchema = z.object({
  request: z.object({
    ticket_id: z.string(),
    type: z.string(),
    form_version: z.string(),
    first_name: text,
    last_name: text,
    work_email: text,
    job_title: text,
    department: text,
    country: text,
    manager_name: text,
    requestor_name: text,
    effective_date: text,
    execution_started_at: text,
  }),
  access: z.array(
    z.object({
      app: z.string(),
      action: z.string(),
      permission: text,
      // Offboarding only (F09b-2): how and when it was removed.
      removal_method: text.optional(),
      done_at: text.optional(),
    }),
  ),
  equipment: z.array(
    z.object({
      type: z.string(),
      action: z.string(),
      description: text,
      asset_tag: text,
      return_status: text.optional(),
      return_reason: text.optional(),
      return_recorded_at: text.optional(),
    }),
  ),
  physical_access: z.array(
    z.object({
      type: z.string(),
      action: z.string(),
      scope: text,
      done_at: text.optional(),
    }),
  ),
  execution: z
    .object({
      // "not_needed" since 2026-10-13 (e.g. no device provided).
      checks: z.record(
        z.string(),
        z.union([z.boolean(), z.literal("not_needed")]),
      ),
      notes: text,
      executed_by_name: text,
    })
    .nullable(),
  /** Offboarding only: section 8, handover and mailbox (F09b-2). */
  offboarding: z
    .object({
      sla_timeline: text,
      last_working_day: text,
      access_cutoff_at: text,
      sla: z
        .object({
          due_at: text,
          total: z.number(),
          done: z.number(),
          removed_at: text,
          met: z.boolean().nullable(),
        })
        .nullable(),
      sla_missed_reason: text,
      handover_to: text,
      mailbox_handling: text,
      mailbox_recorded_at: text,
    })
    .optional(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export type SignerSignature = {
  kind: "signature" | "initials";
  source: "png" | "typed";
  typedText: string | null;
  previewUrl: string | null;
  /** "Uploaded 9 Oct 2026 · 640 × 200 px". */
  detail: string;
};

/** Everything the sheet needs, loaded when it opens. */
export type SigningReview = {
  /** Exactly what will be signed — sent back unchanged to sign. */
  snapshot: Json;
  stateOk: boolean;
  missingFields: string[];
  checklistComplete: boolean;
  signature: SignerSignature | null;
  /** First names of the active approvers. */
  approvers: string[];
  /** The signed-in signer's name (from Clerk). */
  signerName: string;
};

/** A current signature in section 11. */
export type SignedSection = {
  section: "it_execution" | "final_confirmation";
  signerName: string;
  /** "9 Oct 2026, 14:12" — server time. */
  signedLabel: string;
  /** SHA-256 of the signed snapshot. */
  fingerprint: string;
};

export type Row = { label: string; value: string };

const join = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");

/** "Employee" card. */
export function employeeRows(snapshot: Snapshot): Row[] {
  const r = snapshot.request;
  return [
    { label: "Name", value: personName(r.first_name, r.last_name) },
    { label: "Work email", value: r.work_email ?? "" },
    { label: "Job title", value: r.job_title ?? "" },
    { label: "Department", value: r.department ?? "" },
    { label: "Manager", value: r.manager_name ?? "" },
    { label: "Country", value: r.country ? countryName(r.country) : "" },
    { label: "Effective date", value: formatDate(r.effective_date) },
    { label: "Requested by", value: r.requestor_name ?? "" },
  ].map((row) => ({ ...row, value: row.value || "—" }));
}

const RETURNS: Record<string, string> = {
  pending: "Return pending",
  received: "Received",
  not_returned: "Not returned",
};

/**
 * "Access & equipment" card: apps, then equipment, then physical access. An
 * offboarding says how and when each was removed (times in `timeZone`).
 */
export function accessRows(snapshot: Snapshot, timeZone?: string): Row[] {
  return [
    ...appRows(snapshot, timeZone),
    ...equipmentRows(snapshot, timeZone),
    ...physicalRows(snapshot, timeZone),
  ];
}

function when(iso: string | null | undefined, timeZone?: string) {
  return iso
    ? `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}`
    : null;
}

/** Section 5 rows (an offboarding: method, what they had, when removed). */
export function appRows(snapshot: Snapshot, timeZone?: string): Row[] {
  const off = Boolean(snapshot.offboarding);
  return snapshot.access.map((a) => ({
    label: a.app,
    value: off
      ? join(
          a.removal_method ?? "Remove",
          a.permission ? `had ${a.permission}` : null,
          when(a.done_at, timeZone) ?? "not done",
        )
      : join(a.action, a.permission),
  }));
}

/** Section 6 rows (an offboarding: return status, reason, when). */
export function equipmentRows(snapshot: Snapshot, timeZone?: string): Row[] {
  const off = Boolean(snapshot.offboarding);
  return snapshot.equipment.map((e) => ({
    label: join(e.type, e.description),
    value: off
      ? join(
          RETURNS[e.return_status ?? "pending"] ?? "Return pending",
          e.asset_tag,
          e.return_status === "not_returned" ? e.return_reason : null,
          when(e.return_recorded_at, timeZone),
        )
      : join(e.action, e.asset_tag),
  }));
}

/** Section 7 rows (an offboarding: when disabled / removed). */
export function physicalRows(snapshot: Snapshot, timeZone?: string): Row[] {
  const off = Boolean(snapshot.offboarding);
  return snapshot.physical_access.map((p) => ({
    label: p.type,
    value: off
      ? join(p.action, p.scope, when(p.done_at, timeZone) ?? "not done")
      : join(p.action, p.scope),
  }));
}

const TIMELINES: Record<string, string> = {
  same_day: "Same day",
  within_24h: "Within 24h",
  within_48h: "Within 48h",
};

/**
 * Offboarding: section 8 and the handover, from the snapshot — for Review &
 * sign, the approver, the record page and the PDF (times in `timeZone`).
 */
export function offboardingRows(snapshot: Snapshot, timeZone?: string): Row[] {
  const o = snapshot.offboarding;
  if (!o) return [];
  const at = (iso: string | null | undefined) =>
    iso ? `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}` : "—";
  const sla = o.sla;
  const result =
    sla?.met === true
      ? "Met"
      : sla?.met === false
        ? join("Missed", o.sla_missed_reason)
        : "Not decided";
  return [
    { label: "Timeline", value: TIMELINES[o.sla_timeline ?? ""] ?? "—" },
    { label: "Last working day", value: formatDate(o.last_working_day) },
    { label: "Access cut-off", value: at(o.access_cutoff_at) },
    { label: "Deadline", value: at(sla?.due_at) },
    { label: "Last access removed", value: at(sla?.removed_at) },
    {
      label: "Removed within SLA",
      value: sla ? `${result} · ${sla.done} of ${sla.total} removed` : result,
    },
    { label: "Data & mailbox go to", value: o.handover_to || "—" },
    {
      label: "Mailbox",
      value:
        o.mailbox_handling === "converted_shared"
          ? "Converted to a shared mailbox"
          : o.mailbox_handling === "no_mailbox"
            ? "No mailbox to convert"
            : "—",
    },
  ];
}

export type Check = {
  /** false = blocks signing. */
  ok: boolean;
  /** Shown, but doesn't block (2026-10-13: section 9 / devices pending). */
  warn?: boolean;
  label: string;
  /** Where to fix it: a section number or a page. */
  fix: { section: number } | { href: string } | null;
};

/** Offboarding devices still "Return pending": a warning, not a block. */
function pendingDevices(snapshot: Json): Check[] {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success || !parsed.data.offboarding) return [];
  const pending = parsed.data.equipment.filter(
    (e) => (e.return_status ?? "pending") === "pending",
  ).length;
  if (pending === 0) return [];
  return [
    {
      ok: true,
      warn: true,
      label: `${pending === 1 ? "1 device is" : `${pending} devices are`} still Return pending — you can still sign; it stays on the person's record until it's back`,
      fix: { section: 6 },
    },
  ];
}

/** The checks at the top of the sheet: blocking ones and warnings. */
export function signingChecks(review: SigningReview): Check[] {
  const checks: Check[] = [];
  if (!review.stateOk) {
    checks.push({
      ok: false,
      label: "This request is not in execution any more",
      fix: null,
    });
  }
  // Offboarding blockers get their own lines (F09d-2); the rest are fields.
  const { fields: missing, blockers } = splitBlockers(review.missingFields);
  checks.push(
    missing.length === 0
      ? { ok: true, label: "All required fields complete", fix: null }
      : {
          ok: false,
          label: `Required fields empty: ${missing.join(", ")}`,
          fix: { section: 2 },
        },
    ...blockers.map((b) => ({
      ok: false,
      label: b.label,
      fix: { section: b.section },
    })),
    review.checklistComplete
      ? { ok: true, label: "Section 9 checklist complete", fix: null }
      : {
          ok: true,
          warn: true,
          label:
            "Section 9 checklist not complete — you can still sign; unticked items show as “No” on the record",
          fix: { section: 9 },
        },
    ...pendingDevices(review.snapshot),
    review.signature
      ? { ok: true, label: "Your signature is on file", fix: null }
      : {
          ok: false,
          label: "Add your signature or initials in My profile",
          fix: { href: "/profile" },
        },
  );
  return checks;
}

const PDF_SUFFIX: Record<string, string> = {
  onboarding: "onboarding",
  offboarding: "offboarding",
  access_modification: "access-modification",
};

/**
 * "José Müller", onboarding → "jose.muller-onboarding.pdf" (PROJECT_PLAN
 * §8.2): lower case, accents removed, spaces / hyphens inside a name → "-",
 * anything else dropped.
 */
export function pdfFileName(
  first: string | null,
  last: string | null,
  type: string,
): string {
  const clean = (name: string | null) =>
    (name ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  const name = [clean(first), clean(last)].filter(Boolean).join(".");
  return `${name || "request"}-${PDF_SUFFIX[type] ?? "request"}.pdf`;
}

/** "Sign & send to Moises" when he is the only approver (design/review-sign.md). */
export function signButtonLabel(approvers: string[]): string {
  return approvers.length === 1
    ? `Sign & send to ${approvers[0]}`
    : "Sign & send for confirmation";
}

export const signRequestSchema = z.object({
  requestId: z.uuid(),
  snapshot: z.record(z.string(), z.unknown()),
  /** Optional note for the approver — only when signing again after a return. */
  note: z
    .string()
    .trim()
    .max(1000, "Keep the note under 1000 characters.")
    .nullish()
    .transform((value) => value || null),
});

export type SignResult = { ok: true } | { ok: false; message: string };

/** Database refusals of sign_request() → plain words. */
export function signErrorMessage(
  code: string | undefined,
  message: string | undefined,
): string {
  if (code === "40001") {
    return "This request changed while you were reviewing it. Close this and review it again.";
  }
  if (code === "42501") return "Only an IT operator can sign section 9.";
  if (code === "23514" && message) {
    if (message.startsWith("required fields are empty: ")) {
      return `Fill in first: ${message.slice("required fields are empty: ".length)}.`;
    }
    if (message.includes("signature or initials")) {
      return "Add your signature or initials in My profile first.";
    }
    if (message.includes("checklist")) {
      return "Tick every item in section 9 first.";
    }
    if (message.includes("note for the approver")) {
      return "A note for the approver is only for a returned request.";
    }
    if (message.includes("only a request in execution")) {
      return "This request has already been signed or closed.";
    }
  }
  return "Could not sign. Check your connection and try again.";
}
