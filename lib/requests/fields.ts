/** Field types a form_fields row can have (database check constraint). */
export type FieldType =
  | "text"
  | "email"
  | "date"
  | "select"
  | "department"
  | "country"
  | "user"
  | "system";

/** One row of form_fields — the form is drawn from these, not hard-coded. */
export type FormField = {
  key: string;
  label: string;
  section: number;
  field_type: FieldType;
  /** Must be filled before Review & sign (checked in F06). */
  required: boolean;
  help_text: string | null;
};

/** One option of a select-like field. */
export type Choice = { value: string; label: string };
