import * as z from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { formatDate } from "./format";
import { countryName, personName } from "./labels";

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
  }),
  access: z.array(
    z.object({ app: z.string(), action: z.string(), permission: text }),
  ),
  equipment: z.array(
    z.object({
      type: z.string(),
      action: z.string(),
      description: text,
      asset_tag: text,
    }),
  ),
  physical_access: z.array(
    z.object({ type: z.string(), action: z.string(), scope: text }),
  ),
  execution: z
    .object({
      checks: z.record(z.string(), z.boolean()),
      notes: text,
      executed_by_name: text,
    })
    .nullable(),
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

/** "Access & equipment" card: apps, then equipment, then physical access. */
export function accessRows(snapshot: Snapshot): Row[] {
  return [
    ...snapshot.access.map((a) => ({
      label: a.app,
      value: join(a.action, a.permission),
    })),
    ...snapshot.equipment.map((e) => ({
      label: join(e.type, e.description),
      value: join(e.action, e.asset_tag),
    })),
    ...snapshot.physical_access.map((p) => ({
      label: p.type,
      value: join(p.action, p.scope),
    })),
  ];
}

export type Check = {
  ok: boolean;
  label: string;
  /** Where to fix it: a section number or a page. */
  fix: { section: number } | { href: string } | null;
};

/** The blocking checks at the top of the sheet. */
export function signingChecks(review: SigningReview): Check[] {
  const checks: Check[] = [];
  if (!review.stateOk) {
    checks.push({
      ok: false,
      label: "This request is not in execution any more",
      fix: null,
    });
  }
  const missing = review.missingFields;
  checks.push(
    missing.length === 0
      ? { ok: true, label: "All required fields complete", fix: null }
      : {
          ok: false,
          label: `Required fields empty: ${missing.join(", ")}`,
          fix: { section: 2 },
        },
    review.checklistComplete
      ? { ok: true, label: "Section 9 checklist complete", fix: null }
      : {
          ok: false,
          label: "Section 9 checklist is not complete",
          fix: { section: 9 },
        },
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

/** "Sign & send to Moises" when he is the only approver (design/review-sign.md). */
export function signButtonLabel(approvers: string[]): string {
  return approvers.length === 1
    ? `Sign & send to ${approvers[0]}`
    : "Sign & send for confirmation";
}

export const signRequestSchema = z.object({
  requestId: z.uuid(),
  snapshot: z.record(z.string(), z.unknown()),
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
    if (message.includes("only a request in execution")) {
      return "This request has already been signed or closed.";
    }
  }
  return "Could not sign. Check your connection and try again.";
}
