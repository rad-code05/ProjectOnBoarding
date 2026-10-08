import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countryOptions } from "./countries";
import type { AccessChoices, CatalogCategory, OtherApp } from "./access";
import type { DraftFormValues } from "./draft";
import type { Choice, FieldType, FormField } from "./fields";
import { formatDay, formatTime } from "./format";
import {
  EMPLOYMENT_EVENTS,
  STATE_LABELS,
  TYPE_LABELS,
  type RequestState,
  type RequestType,
} from "./labels";

export type RequestFormData = {
  id: string;
  ticketId: string;
  state: RequestState;
  version: number;
  /** Only open requests can be changed (RLS says the same). */
  editable: boolean;
  createdLabel: string;
  savedLabel: string | null;
  fields: FormField[];
  values: DraftFormValues;
  /** Read-only values of "system" fields, by key. */
  system: Record<string, string>;
  /** Choices for select-like fields, by key. */
  choices: Record<string, Choice[]>;
  /** Section 5: the catalog (active apps) and this request's choices. */
  catalog: CatalogCategory[];
  access: AccessChoices;
  /** Section 5: applications typed on this request ("Other"). */
  others: OtherApp[];
};

const EDITABLE_STATES: RequestState[] = ["draft", "in_execution", "returned"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "access_modification" → "Access modification". */
function humanize(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Everything the request form needs, read with the signed-in user's own
 * session (RLS: approvers never see drafts). null = not found or not visible.
 */
export async function loadRequestForm(
  id: string,
): Promise<RequestFormData | null> {
  if (!UUID.test(id)) return null;
  const supabase = createServerSupabaseClient();

  const { data: request, error } = await supabase
    .from("requests")
    .select(
      "id, ticket_id, type, state, priority, assignee_id, first_name, last_name, work_email, job_title, department_id, country, manager_name, requestor_name, effective_date, form_version_id, version, created_at, updated_at, closed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the request: ${error.message}`);
  if (!request) return null;

  const [fields, departments, operators, catalog, items] = await Promise.all([
    supabase
      .from("form_fields")
      .select("key, label, section, field_type, required, help_text, options")
      .eq("form_version_id", request.form_version_id)
      .in("section", [1, 2])
      .contains("applies_to", [request.type])
      .order("section")
      .order("sort_order"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("user_roles")
      .select(
        "clerk_user_id, app_users!user_roles_clerk_user_id_fkey!inner(first_name, last_name, active)",
      )
      .eq("role", "it_operator")
      .eq("app_users.active", true),
    supabase
      .from("catalog_categories")
      .select(
        "id, name, catalog_apps(id, name, actions, permissions, active, sort_order)",
      )
      .eq("active", true)
      .order("sort_order")
      .order("sort_order", { referencedTable: "catalog_apps" }),
    supabase
      .from("request_access_items")
      .select("id, app_id, app_name, action, permission, notes")
      .eq("request_id", request.id)
      .order("created_at"),
  ]);
  for (const result of [fields, departments, operators, catalog, items]) {
    if (result.error) {
      throw new Error(`Could not load the form: ${result.error.message}`);
    }
  }

  const assignees: Choice[] = (operators.data ?? []).map((row) => ({
    value: row.clerk_user_id,
    label:
      [row.app_users.first_name, row.app_users.last_name]
        .filter(Boolean)
        .join(" ") || "Unnamed user",
  }));
  if (
    request.assignee_id &&
    !assignees.some((choice) => choice.value === request.assignee_id)
  ) {
    assignees.push({
      value: request.assignee_id,
      label: "Current assignee (not an IT operator)",
    });
  }

  const choices: Record<string, Choice[]> = {
    department: (departments.data ?? []).map((d) => ({
      value: String(d.id),
      label: d.name,
    })),
    country: countryOptions(),
    assignee: assignees,
  };
  for (const field of fields.data ?? []) {
    if (field.field_type === "select" && Array.isArray(field.options)) {
      choices[field.key] = field.options.map((option) => ({
        value: String(option),
        label:
          field.key === "type"
            ? TYPE_LABELS[option as RequestType]
            : humanize(String(option)),
      }));
    }
  }

  return {
    id: request.id,
    ticketId: request.ticket_id,
    state: request.state,
    version: request.version,
    editable: EDITABLE_STATES.includes(request.state),
    createdLabel: `${formatDay(request.created_at)}, ${formatTime(request.created_at)}`,
    savedLabel: request.version > 1 ? formatTime(request.updated_at) : null,
    fields: (fields.data ?? []).map((field) => ({
      key: field.key,
      label: field.label,
      section: field.section,
      field_type: field.field_type as FieldType,
      required: field.required,
      help_text: field.help_text,
    })),
    values: {
      type: request.type,
      priority: request.priority,
      assignee: request.assignee_id ?? "",
      first_name: request.first_name ?? "",
      last_name: request.last_name ?? "",
      work_email: request.work_email ?? "",
      job_title: request.job_title ?? "",
      department: request.department_id ? String(request.department_id) : "",
      country: request.country ?? "",
      manager_name: request.manager_name ?? "",
      requestor_name: request.requestor_name ?? "",
      effective_date: request.effective_date ?? "",
    },
    system: {
      ticket_id: request.ticket_id,
      status: STATE_LABELS[request.state],
      opened_at: formatDay(request.created_at),
      closed_at: formatDay(request.closed_at),
      employment_event: EMPLOYMENT_EVENTS[request.type],
    },
    choices,
    catalog: (catalog.data ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      apps: category.catalog_apps
        .filter((app) => app.active)
        .map(({ id, name, actions, permissions }) => ({
          id,
          name,
          actions,
          permissions,
        })),
    })),
    access: Object.fromEntries(
      (items.data ?? []).flatMap((item) =>
        item.app_id === null
          ? []
          : [
              [
                item.app_id,
                {
                  action: item.action,
                  permission: item.permission,
                  notes: item.notes,
                },
              ],
            ],
      ),
    ),
    others: (items.data ?? [])
      .filter((item) => item.app_id === null)
      .map((item) => ({
        id: item.id,
        name: item.app_name,
        action: item.action,
        permission: item.permission,
        notes: item.notes,
      })),
  };
}
