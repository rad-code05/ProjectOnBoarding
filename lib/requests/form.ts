import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone, displayTimezone } from "@/lib/time/display";
import { zonedParts } from "@/lib/time/zoned";
import { countryOptions } from "./countries";
import {
  OTHER_ACTIONS,
  type AccessChoices,
  type CatalogCategory,
  type OtherApp,
} from "./access";
import { allowedActions } from "./actions-by-type";
import type { DraftFormValues } from "./draft";
import type {
  CheckValue,
  ChecklistItem,
  ExecutionRecord,
  WorkflowInfo,
} from "./execution";
import type {
  EquipmentItem,
  EquipmentType,
  PhysicalChoices,
  PhysicalType,
} from "./equipment";
import type { Choice, FieldType, FormField } from "./fields";
import { formatDay, formatTime } from "./format";
import {
  EMPLOYMENT_EVENTS,
  personName,
  STATE_LABELS,
  TYPE_LABELS,
  type RequestState,
  type RequestType,
} from "./labels";
import { flaggedSections, type ReturnInfo } from "./returned";
import type {
  MailboxHandling,
  RemovalMethod,
  Removals,
  SlaResult,
  ReturnStatus,
} from "./offboarding";
import type { SignedSection } from "./signing";

export type RequestFormData = {
  id: string;
  ticketId: string;
  state: RequestState;
  version: number;
  /** Only open requests can be changed (RLS says the same). */
  editable: boolean;
  /** Section 9 and the workflow banner. */
  checklist: ChecklistItem[];
  execution: ExecutionRecord;
  workflow: WorkflowInfo;
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
  /** Actions an "Other" application can take on this type of request. */
  otherActions: string[];
  /** Sections 6–7: their types and this request's rows. */
  equipmentTypes: EquipmentType[];
  equipment: EquipmentItem[];
  physicalTypes: PhysicalType[];
  physical: PhysicalChoices;
  /** Section 11: the current (not cleared) signatures. */
  signatures: SignedSection[];
  /** While returned: who returned it, when, the comment, flagged sections. */
  returned: ReturnInfo | null;
  /** The signed-in person's screen timezone (F05e). */
  timezone: string;
  /** Offboarding only (F09c-2): SLA in the company timezone, what to remove. */
  offboarding: {
    companyTimezone: string;
    /** The deadline the database worked out (null until set). */
    dueAt: string | null;
    removals: Removals;
    mailbox: { handling: MailboxHandling | null; recordedAt: string | null };
    /** request_sla(): removals done / total, last removal, met. */
    sla: SlaResult;
  } | null;
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
  // Asked in parallel with the queries below (one round trip less).
  const tzPromise = displayTimezone();
  const companyTzPromise = companyTimezone();

  const { data: request, error } = await supabase
    .from("requests")
    .select(
      "id, ticket_id, type, state, priority, assignee_id, first_name, last_name, work_email, job_title, department_id, country, manager_name, requestor_name, effective_date, sla_timeline, last_working_day, access_cutoff_at, sla_due_at, handover_to, sla_missed_reason, mailbox_handling, mailbox_recorded_at, form_version_id, version, created_at, updated_at, closed_at, execution_started_at, cancelled_at, cancel_reason, return_reason, canceller:app_users!requests_cancelled_by_fkey(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the request: ${error.message}`);
  if (!request) return null;

  const [
    fields,
    departments,
    operators,
    catalog,
    items,
    equipmentTypes,
    equipment,
    physicalTypes,
    physical,
    checklist,
    execution,
    signatures,
    lastReturn,
  ] = await Promise.all([
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
      .select(
        "id, app_id, app_name, category_name, action, permission, notes, removal_method, done_at",
      )
      .eq("request_id", request.id)
      .order("created_at"),
    supabase
      .from("equipment_types")
      .select("id, name, actions, needs_description")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("request_equipment_items")
      .select(
        "id, type_id, type_name, action, description, asset_tag, notes, return_status, return_reason, return_recorded_at",
      )
      .eq("request_id", request.id)
      .order("created_at"),
    supabase
      .from("physical_access_types")
      .select("id, name, actions, scopes")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("request_physical_access_items")
      .select("id, type_id, type_name, action, scope, notes, done_at")
      .eq("request_id", request.id)
      .order("created_at"),
    supabase
      .from("execution_checklist_items")
      .select("key, label")
      .eq("active", true)
      .contains("applies_to", [request.type])
      .order("sort_order"),
    supabase
      .from("execution_confirmations")
      .select(
        "checks, notes, executor:app_users!execution_confirmations_executed_by_fkey(first_name, last_name)",
      )
      .eq("request_id", request.id)
      .maybeSingle(),
    supabase
      .from("signatures")
      .select(
        "section, signed_at, signer:app_users!signatures_signer_id_fkey(first_name, last_name), snapshot:request_snapshots!signatures_snapshot_id_fkey(sha256)",
      )
      .eq("request_id", request.id)
      .is("cleared_at", null)
      .order("signed_at"),
    supabase
      .from("approvals")
      .select(
        "comment, flagged_sections, decided_at, approver:app_users!approvals_decided_by_fkey(first_name, last_name)",
      )
      .eq("request_id", request.id)
      .eq("decision", "returned")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const tz = await tzPromise;
  const slaRow =
    request.type === "offboarding"
      ? await supabase.rpc("request_sla", { p_request_id: request.id })
      : null;
  const slaJson = (slaRow?.data ?? null) as {
    total?: number;
    done?: number;
    removed_at?: string | null;
    met?: boolean | null;
  } | null;
  const companyTz = await companyTzPromise;
  const cutoff = request.access_cutoff_at
    ? zonedParts(request.access_cutoff_at, companyTz)
    : { date: "", time: "" };
  for (const result of [
    fields,
    departments,
    operators,
    catalog,
    items,
    equipmentTypes,
    equipment,
    physicalTypes,
    physical,
    checklist,
    execution,
    signatures,
    lastReturn,
  ]) {
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
      // An offboarding is started from New request and stays one (the
      // database refuses switching a draft to or from it).
      const options =
        field.key === "type"
          ? field.options.filter(
              (option) =>
                (option === "offboarding") === (request.type === "offboarding"),
            )
          : field.options;
      choices[field.key] = options.map((option) => ({
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
    createdLabel: `${formatDay(request.created_at, tz)}, ${formatTime(request.created_at, tz)}`,
    savedLabel: request.version > 1 ? formatTime(request.updated_at, tz) : null,
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
      sla_timeline: request.sla_timeline ?? "",
      last_working_day: request.last_working_day ?? "",
      cutoff_date: cutoff.date,
      cutoff_time: cutoff.time,
      handover_to: request.handover_to ?? "",
      sla_missed_reason: request.sla_missed_reason ?? "",
    },
    system: {
      ticket_id: request.ticket_id,
      status: STATE_LABELS[request.state],
      opened_at: formatDay(request.created_at, tz),
      closed_at: formatDay(request.closed_at, tz),
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
          // Only the actions this type of request offers (2026-10-13).
          actions: allowedActions(
            request.type,
            "app",
            actions,
            (items.data ?? []).find((item) => item.app_id === id)?.action,
          ),
          permissions,
        }))
        // An app this type can't use at all isn't offered (offboarding adds
        // its rows through its own sheet, so it keeps the whole catalog).
        .filter(
          (app) => request.type === "offboarding" || app.actions.length > 0,
        ),
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
    equipmentTypes: (equipmentTypes.data ?? []).map((type) => ({
      id: type.id,
      name: type.name,
      actions: allowedActions(request.type, "equipment", type.actions),
      needsDescription: type.needs_description,
    })),
    equipment: (equipment.data ?? []).map((item) => ({
      id: item.id,
      typeId: item.type_id,
      typeName: item.type_name,
      action: item.action,
      description: item.description,
      assetTag: item.asset_tag,
      notes: item.notes,
    })),
    physicalTypes: (physicalTypes.data ?? []).map((type) => ({
      ...type,
      actions: allowedActions(
        request.type,
        "access",
        type.actions,
        (physical.data ?? []).find((row) => row.type_id === type.id)?.action,
      ),
    })),
    otherActions: allowedActions(request.type, "app", OTHER_ACTIONS),
    checklist: checklist.data ?? [],
    execution: {
      checks: (execution.data?.checks ?? {}) as Record<string, CheckValue>,
      notes: execution.data?.notes ?? null,
      executedBy: execution.data
        ? personName(
            execution.data.executor?.first_name,
            execution.data.executor?.last_name,
          ) || "IT operator"
        : null,
    },
    workflow: {
      executionStartedLabel: request.execution_started_at
        ? `${formatDay(request.execution_started_at, tz)}, ${formatTime(request.execution_started_at, tz)}`
        : null,
      cancelledLabel: request.cancelled_at
        ? [
            `${formatDay(request.cancelled_at, tz)}, ${formatTime(request.cancelled_at, tz)}`,
            personName(
              request.canceller?.first_name,
              request.canceller?.last_name,
            ),
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
      cancelReason: request.cancel_reason,
      returnReason: request.return_reason,
    },
    physical: Object.fromEntries(
      (physical.data ?? []).map((row) => [
        row.type_id,
        { action: row.action, scope: row.scope, notes: row.notes },
      ]),
    ),
    signatures: (signatures.data ?? []).map((row) => ({
      section: row.section as SignedSection["section"],
      signerName:
        personName(row.signer?.first_name, row.signer?.last_name) ||
        "IT operator",
      signedLabel: `${formatDay(row.signed_at, tz)}, ${formatTime(row.signed_at, tz)}`,
      fingerprint: row.snapshot.sha256,
    })),
    returned:
      request.state === "returned"
        ? returnInfo(lastReturn.data, request.return_reason, tz)
        : null,
    timezone: tz,
    offboarding:
      request.type === "offboarding"
        ? {
            companyTimezone: companyTz,
            dueAt: request.sla_due_at,
            removals: {
              apps: (items.data ?? []).map((item) => ({
                id: item.id,
                appId: item.app_id,
                name: item.app_name,
                category: item.category_name,
                had: item.permission,
                method: item.removal_method as RemovalMethod | null,
                doneAt: item.done_at,
              })),
              equipment: (equipment.data ?? []).map((item) => ({
                id: item.id,
                name: item.type_name,
                assetTag: item.asset_tag,
                description: item.description,
                status: (item.return_status ?? "pending") as ReturnStatus,
                reason: item.return_reason,
                recordedAt: item.return_recorded_at,
              })),
              access: (physical.data ?? []).map((row) => ({
                id: row.id,
                typeId: row.type_id,
                name: row.type_name,
                action: row.action,
                scope: row.scope,
                doneAt: row.done_at,
              })),
            },
            sla: {
              total: slaJson?.total ?? 0,
              done: slaJson?.done ?? 0,
              removedAt: slaJson?.removed_at ?? null,
              met: slaJson?.met ?? null,
            },
            mailbox: {
              handling: request.mailbox_handling as MailboxHandling | null,
              recordedAt: request.mailbox_recorded_at,
            },
          }
        : null,
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

type ReturnRow = {
  comment: string | null;
  flagged_sections: number[];
  decided_at: string;
  approver: { first_name: string | null; last_name: string | null } | null;
};

/** The latest return as shown on the request (falls back to the reason). */
function returnInfo(
  row: ReturnRow | null,
  reason: string | null,
  tz: string,
): ReturnInfo | null {
  if (!row) {
    return reason
      ? {
          byName: "the approver",
          byFirstName: "the approver",
          atLabel: "",
          comment: reason,
          flagged: [],
        }
      : null;
  }
  const first = row.approver?.first_name?.trim();
  return {
    byName:
      personName(row.approver?.first_name, row.approver?.last_name) ||
      "the approver",
    byFirstName: first || "the approver",
    atLabel: `${formatDay(row.decided_at, tz)}, ${formatTime(row.decided_at, tz)}`,
    comment: row.comment ?? reason ?? "",
    flagged: flaggedSections(row.flagged_sections),
  };
}
