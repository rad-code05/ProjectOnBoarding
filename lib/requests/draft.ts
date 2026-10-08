import * as z from "zod";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { COUNTRY_CODES } from "./countries";

/**
 * What the form sends when a draft is saved: every editable field of
 * sections 1–2 as text, "" meaning empty. A draft may be incomplete —
 * required fields are checked at Review & sign (F06) — but whatever is
 * filled in must be valid.
 */
const text = z
  .string()
  .trim()
  .max(200, "Keep it under 200 characters.")
  .transform((value) => value || null);

const emptyOr = <T extends z.ZodType<string>>(schema: T) =>
  z
    .union([z.literal(""), schema])
    .transform((value) => (value === "" ? null : value));

export const draftValuesSchema = z.object({
  type: z.enum(["onboarding", "offboarding", "access_modification"]),
  priority: z.enum(["low", "medium", "high"]),
  assignee: text,
  first_name: text,
  last_name: text,
  work_email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      emptyOr(
        z.email("Enter a valid email address, e.g. anna.keller@laine.ai."),
      ),
    ),
  job_title: text,
  department: z
    .string()
    .regex(/^\d*$/, "Choose a department from the list.")
    .transform((value) => (value ? Number(value) : null)),
  country: emptyOr(
    z.string().refine((code) => COUNTRY_CODES.includes(code), {
      message: "Choose a country from the list.",
    }),
  ),
  manager_name: text,
  requestor_name: text,
  effective_date: emptyOr(z.iso.date("Enter a date.")),
});

/** Form values as the browser holds them: field key → text. */
export type DraftFormValues = z.input<typeof draftValuesSchema>;
export type DraftValues = z.output<typeof draftValuesSchema>;
export type DraftFieldKey = keyof DraftFormValues;

export const saveDraftSchema = z.object({
  id: z.uuid(),
  /** The version the form was loaded with — a newer one in the database means a conflict. */
  version: z.int().positive(),
});

/** Field key (form_fields.key) → column on public.requests. */
export function toColumns(values: DraftValues): TablesUpdate<"requests"> {
  return {
    type: values.type,
    priority: values.priority,
    assignee_id: values.assignee,
    first_name: values.first_name,
    last_name: values.last_name,
    work_email: values.work_email,
    job_title: values.job_title,
    department_id: values.department,
    country: values.country,
    manager_name: values.manager_name,
    requestor_name: values.requestor_name,
    effective_date: values.effective_date,
  };
}

export type SaveDraftResult =
  | { ok: true; version: number; savedAt: string }
  | {
      ok: false;
      reason: "invalid";
      fieldErrors: Partial<Record<DraftFieldKey, string>>;
    }
  | { ok: false; reason: "conflict" | "error"; message: string };

/** Zod issues → first message per field, for showing under each field. */
export function fieldErrorsOf(
  error: z.ZodError,
): Partial<Record<DraftFieldKey, string>> {
  const errors: Partial<Record<DraftFieldKey, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]) as DraftFieldKey;
    errors[key] ??= issue.message;
  }
  return errors;
}
