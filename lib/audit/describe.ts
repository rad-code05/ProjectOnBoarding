import { ROLE_LABELS } from "@/lib/navigation";
import { REPORTS } from "@/lib/reports/catalog";
import { STATE_LABELS, TYPE_LABELS } from "@/lib/requests/labels";
import type { Database, Json } from "@/lib/supabase/database.types";

type RequestType = Database["public"]["Enums"]["request_type"];
type RequestState = Database["public"]["Enums"]["request_state"];
type Source = Database["public"]["Enums"]["audit_source"];

/** One audit event as the database returns it (audit_log / request_activity). */
export type RawAuditEvent = {
  action: string;
  source: Source;
  actor_id: string | null;
  actor_name: string | null;
  actor_email?: string | null;
  entity?: string | null;
  entity_id?: string | null;
  ticket_id?: string | null;
  request_type?: RequestType | null;
  employee_name?: string | null;
  diff: Json;
};

export type SourceChip = "People" | "AI" | "System";

export type EventDescription = {
  /** "Raju Bholani", "System", or the email of an unknown account. */
  who: string;
  /** What happened, after the name: "signed UAM-2026-000141 (Review & sign)". */
  what: string;
  /** Short context after the time: "section 5", "fingerprint 5d20a9e1…". */
  context: string | null;
  chip: SourceChip;
};

export type ChangeRow = { field: string; before: string; after: string };

type Obj = { [key: string]: Json | undefined };

const isObj = (value: Json | undefined): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (d: Obj, key: string): string | null => {
  const v = d[key];
  return typeof v === "string" && v
    ? v
    : typeof v === "number"
      ? String(v)
      : null;
};
const num = (d: Obj, key: string): number =>
  typeof d[key] === "number" ? (d[key] as number) : 0;
const obj = (d: Obj, key: string): Obj => {
  const v = d[key];
  return isObj(v) ? v : {};
};

const roleLabel = (role: string | null) =>
  role && role in ROLE_LABELS
    ? ROLE_LABELS[role as keyof typeof ROLE_LABELS]
    : (role ?? "a");

const SOURCE_CHIPS: Record<Source, SourceChip> = {
  user: "People",
  ai: "AI",
  system: "System",
};

/** Field names (database columns / JSON keys) in plain words. */
const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  work_email: "Work email",
  job_title: "Job title",
  department_id: "Department",
  country: "Country",
  office_id: "Office",
  region_id: "State",
  office_city_id: "City",
  nationalities: "Nationality",
  manager_name: "Manager",
  requestor_name: "Requestor",
  effective_date: "Effective date",
  priority: "Priority",
  assignee_id: "Assignee",
  custom_fields: "Extra fields",
  last_working_day: "Last working day",
  access_cutoff_at: "Access cut-off",
  sla_timeline: "SLA",
  handover_to: "Handover to",
  sla_missed_reason: "Why the SLA was missed",
  app: "Application",
  action: "Action",
  permission: "Permission",
  notes: "Notes",
  type: "Type",
  description: "Description",
  asset_tag: "Asset tag",
  scope: "Scope",
  checks: "Section 9",
  name: "Name",
  actions: "Actions",
  permissions: "Permissions",
  scopes: "Scopes",
  category_id: "Category",
  multi_permission: "Several roles in one row",
  needs_description: "Needs a description",
  email: "Email",
  active: "Active",
  role: "Role",
  granted_by: "Granted by",
  reason: "Reason",
  note: "Note for the approver",
  file_name: "File",
  sha256: "Fingerprint (SHA-256)",
  snapshot_sha256: "Fingerprint (SHA-256)",
  flagged_sections: "Flagged sections",
  method: "Method",
  kind: "Kind",
  source: "Source",
  rows: "Rows",
  filters: "Filters",
  added: "Added",
  ended: "Ended",
  held: "Items on record",
};

/** Stored codes in plain words (answers, mailbox, returns, types, states). */
const VALUE_LABELS: Record<string, string> = {
  not_needed: "Not needed",
  no_change: "No changes made",
  converted_shared: "Converted to shared",
  no_mailbox: "No mailbox to convert",
  received: "Returned",
  not_returned: "Not returned",
  ...TYPE_LABELS,
  ...STATE_LABELS,
};

/** "access_provisioned" → "Access provisioned". */
export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const words = key.replace(/[_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Any stored value as short text: null → "—", lists joined, Yes / No. */
export function valueText(value: Json | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.length ? value.map(valueText).join(", ") : "—";
  if (isObj(value)) {
    return (
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${fieldLabel(k)}: ${valueText(v)}`)
        .join(" · ") || "—"
    );
  }
  if (typeof value === "string" && VALUE_LABELS[value]) {
    return VALUE_LABELS[value];
  }
  return String(value);
}

const CATALOG_KINDS: Record<string, string> = {
  app: "the application",
  category: "the category",
  equipment_type: "the equipment type",
  access_type: "the access type",
};
const CATALOG_VERBS: Record<string, string> = {
  added: "added",
  changed: "changed",
  retired: "retired",
  restored: "brought back",
};

const SECTION9 = (checks: Obj) => {
  const values = Object.values(checks);
  const answered = values.filter((v) => v !== null && v !== undefined).length;
  return `${answered} of ${values.length} answered`;
};

/**
 * One event in plain words (boards: Phone · Audit log, Request activity).
 * `ref` is how the request is named: its ticket on the audit log; null on the
 * request's own timeline ("added Slack", "confirmed, signed and closed it").
 * `people` maps Clerk IDs to names, for events about another account.
 */
export function describeEvent(
  ev: RawAuditEvent,
  options: { ref?: string | null; people?: Record<string, string> } = {},
): EventDescription {
  const d: Obj = isObj(ev.diff) ? ev.diff : {};
  const people = options.people ?? {};
  const ticket = ev.ticket_id ?? str(d, "ticket_id");
  const ref = options.ref === undefined ? ticket : options.ref;
  const on = ref ? ` on ${ref}` : "";
  const to = ref ? ` to ${ref}` : "";
  const it = ref ?? "it";
  const who =
    ev.actor_name ??
    (ev.actor_id
      ? (people[ev.actor_id] ?? ev.actor_email ?? "Unknown account")
      : "System");
  const chip = SOURCE_CHIPS[ev.source] ?? "People";
  const say = (
    what: string,
    context: string | null = null,
  ): EventDescription => ({
    who,
    what,
    context,
    chip,
  });
  const target = ev.entity_id
    ? (people[ev.entity_id] ?? "an account")
    : "an account";

  const [group, verb] = ev.action.split(".", 2) as [string, string | undefined];

  if (group === "catalog" && verb) {
    const match = verb.match(
      /^(app|category|equipment_type|access_type)_(added|changed|retired|restored)$/,
    );
    if (match) {
      const name =
        str(obj(d, "after"), "name") ??
        str(d, "name") ??
        str(obj(d, "before"), "name");
      const admin =
        match[1] === "app" || match[1] === "category"
          ? "Admin → Applications"
          : "Admin → Equipment & access types";
      return say(
        `${CATALOG_VERBS[match[2]]} ${CATALOG_KINDS[match[1]]}${name ? ` “${name}”` : ""}`,
        admin,
      );
    }
  }

  if (ev.action === "office.cities_loaded") {
    return say(
      `loaded ${num(d, "cities")} US cities (Census, 100,000+ people)`,
      "Admin → Offices",
    );
  }
  if (group === "office" && verb) {
    const match = verb.match(/^(city_)?(added|changed|retired|restored)$/);
    if (match) {
      const after = obj(d, "after");
      const name =
        str(after, "name") ?? str(d, "name") ?? str(obj(d, "before"), "name");
      const where = [str(after, "office"), str(after, "region")]
        .filter(Boolean)
        .join(" · ");
      return say(
        `${CATALOG_VERBS[match[2]]} ${match[1] ? "the city" : "the office"}${name ? ` “${name}”` : ""}${where ? ` (${where})` : ""}`,
        "Admin → Offices",
      );
    }
  }

  switch (ev.action) {
    case "request.created": {
      const type = (str(d, "type") ?? ev.request_type) as RequestType | null;
      const kind = type ? TYPE_LABELS[type].toLowerCase() : "request";
      return say(
        `created the ${kind} ${it}`.replace(/ it$/, ""),
        ev.employee_name,
      );
    }
    case "request.offboarding_started": {
      const p = obj(d, "prefilled");
      const n = num(p, "applications") + num(p, "equipment") + num(p, "access");
      return say(
        `started the offboarding${ref ? ` ${ref}` : ""}${ev.employee_name ? ` for ${ev.employee_name}` : ""}`,
        `${n} item${n === 1 ? "" : "s"} pre-filled`,
      );
    }
    case "request.access_change_started": {
      const n = num(d, "held");
      return say(
        `started the access change${ref ? ` ${ref}` : ""}${ev.employee_name ? ` for ${ev.employee_name}` : ""}`,
        `${n} item${n === 1 ? "" : "s"} on record`,
      );
    }
    case "request.updated": {
      const keys = Object.keys(obj(d, "changes"));
      const what =
        keys.length === 1 ? fieldLabel(keys[0]) : `${keys.length} details`;
      return say(`changed ${what}${on}`, "section 2");
    }
    case "request.state_changed": {
      const toState = str(d, "to") as RequestState | null;
      const reason = str(d, "reason");
      switch (toState) {
        case "in_execution":
          return say(`started execution${ref ? ` of ${ref}` : ""}`);
        case "cancelled":
          return say(`cancelled ${it}`, reason);
        case "pending_confirmation":
          return say(`sent ${it} for confirmation`);
        case "returned":
          return say(`returned ${it}`);
        case "closed":
          return say(`closed ${it}`);
        default: {
          const fromState = str(d, "from") as RequestState | null;
          return say(
            `moved ${it} from ${fromState ? STATE_LABELS[fromState] : "—"} to ${toState ? STATE_LABELS[toState] : "—"}`,
            reason,
          );
        }
      }
    }
    case "request.access_added":
    case "request.equipment_added":
    case "request.physical_added": {
      const name = str(d, "app") ?? str(d, "type") ?? "an item";
      const detail = [str(d, "action"), str(d, "permission") ?? str(d, "scope")]
        .filter(Boolean)
        .join(" · ");
      return say(`added ${name}${to}`, detail || null);
    }
    case "request.access_removed":
    case "request.equipment_removed":
    case "request.physical_removed": {
      const name = str(d, "app") ?? str(d, "type") ?? "an item";
      return say(`took ${name} off${ref ? ` ${ref}` : " the request"}`);
    }
    case "request.access_changed":
    case "request.equipment_changed":
    case "request.physical_changed": {
      const before = obj(d, "before");
      const after = obj(d, "after");
      const name =
        str(d, "app") ?? str(after, "type") ?? str(before, "type") ?? "an item";
      const key = ["permission", "scope", "action"].find(
        (k) => k in after && valueText(before[k]) !== valueText(after[k]),
      );
      const was = key ? valueText(before[key]) : "—";
      const change = !key
        ? ""
        : was === "—"
          ? ` — ${valueText(after[key])}`
          : ` — ${was} → ${valueText(after[key])}`;
      const section =
        ev.action === "request.access_changed"
          ? "section 5"
          : ev.action === "request.equipment_changed"
            ? "section 6"
            : "section 7";
      return say(`changed ${name}${on}${change}`, section);
    }
    case "request.execution_updated":
      return say(
        `ticked section 9${on}`,
        SECTION9(obj(obj(d, "after"), "checks")),
      );
    case "request.removal_method_set":
      return say(
        `chose ${str(d, "method") ?? "a method"} for ${str(d, "name") ?? "an item"}${on}`,
        "section 8",
      );
    case "request.removal_done":
      return say(
        `removed ${str(d, "name") ?? "an item"}${on}`,
        str(d, "method"),
      );
    case "request.removal_undone":
      return say(
        `un-ticked the removal of ${str(d, "name") ?? "an item"}${on}`,
      );
    case "request.equipment_return_set": {
      const status = str(d, "after");
      const label =
        status === "received"
          ? "returned"
          : status === "not_returned"
            ? "not returned"
            : "return pending";
      return say(
        `marked ${str(d, "type") ?? "a device"} as ${label}${on}`,
        str(d, "reason"),
      );
    }
    case "request.mailbox_set": {
      const after = str(d, "after");
      return say(
        after === "converted_shared"
          ? `recorded the mailbox as converted to shared${on}`
          : after === "no_mailbox"
            ? `recorded no mailbox to convert${on}`
            : `cleared the mailbox choice${on}`,
      );
    }
    case "request.signed": {
      const hash = str(d, "snapshot_sha256");
      return say(
        `signed${ref ? ` ${ref}` : ""} (Review & sign)`,
        hash ? `fingerprint ${hash.slice(0, 8)}…` : null,
      );
    }
    case "request.confirmed":
      return say(
        `confirmed, signed and closed ${it}`,
        ref && ev.request_type
          ? [TYPE_LABELS[ev.request_type], ev.employee_name]
              .filter(Boolean)
              .join(" · ")
          : null,
      );
    case "request.returned": {
      const flagged = Array.isArray(d.flagged_sections)
        ? d.flagged_sections
        : [];
      return say(
        `returned ${it} to IT`,
        flagged.length
          ? `flagged section${flagged.length === 1 ? "" : "s"} ${flagged.join(", ")}`
          : null,
      );
    }
    case "record.generated":
      return say(`made ${str(d, "file_name") ?? "the PDF record"}`, ref);
    case "record.downloaded":
      return say(`downloaded ${str(d, "file_name") ?? "the PDF record"}`, ref);
    case "audit.exported": {
      const rows = num(d, "rows");
      return say(`exported ${rows} audit event${rows === 1 ? "" : "s"} (CSV)`);
    }
    case "report.custom_saved":
    case "report.custom_changed":
    case "report.custom_deleted": {
      const verb = {
        "report.custom_saved": "made",
        "report.custom_changed": "changed",
        "report.custom_deleted": "deleted",
      }[ev.action];
      const parts = num(d, "parts");
      return say(
        `${verb} the custom report "${str(d, "title") ?? "untitled"}" (${parts} part${parts === 1 ? "" : "s"})`,
        "Reports",
      );
    }
    case "report.exported": {
      const rows = num(d, "rows");
      const f = d.filters;
      const custom =
        ev.entity_id === "custom" &&
        f &&
        typeof f === "object" &&
        !Array.isArray(f)
          ? str(f as Obj, "title")
          : null;
      const name =
        REPORTS.find((r) => r.key === ev.entity_id)?.name ?? "a report";
      const format = (str(d, "format") ?? "csv").toUpperCase();
      return say(
        `exported ${custom ? `the custom report "${custom}"` : name === "a report" ? name : `the ${name}`} (${format}, ${rows} row${rows === 1 ? "" : "s"})`,
        "Reports",
      );
    }
    case "employee.created":
      return say(
        `added ${str(d, "work_email") ?? "a person"} to the people on record`,
      );
    case "inventory.updated": {
      const parts = [
        num(d, "added") ? `${num(d, "added")} added` : null,
        num(d, "ended") ? `${num(d, "ended")} ended` : null,
      ].filter(Boolean);
      return say(
        `updated ${ev.employee_name ? `${ev.employee_name}'s` : "the"} access inventory${parts.length ? ` — ${parts.join(", ")}` : ""}`,
        ref,
      );
    }
    case "signature.added": {
      const kind = str(d, "kind") === "initials" ? "initials" : "signature";
      const how =
        { png: "uploaded", typed: "typed", drawn: "drew" }[
          str(d, "source") ?? ""
        ] ?? "added";
      return say(`${how} new ${kind}`, "My profile");
    }
    case "signature.activated":
      return say("switched to another saved signature", "My profile");
    case "session.created":
      return say("signed in");
    case "session.ended":
    case "session.removed":
      return say("signed out");
    case "session.revoked":
      return say("was signed out (session ended by the system)");
    case "account.password_changed":
      return say("changed their password", "My profile → Security");
    case "account.authenticator_replaced":
      return say("set up a new authenticator app", "My profile → Security");
    case "account.backup_codes_regenerated":
      return say("made new backup codes", "My profile → Security");
    case "ai.model_added":
    case "ai.model_changed":
    case "ai.model_retired":
    case "ai.model_restored": {
      const name =
        str(obj(d, "after"), "name") ??
        str(d, "name") ??
        str(obj(d, "before"), "name");
      const verb = {
        "ai.model_added": "added",
        "ai.model_changed": "changed",
        "ai.model_retired": "retired",
        "ai.model_restored": "restored",
      }[ev.action];
      return say(
        `${verb} the AI model${name ? ` “${name}”` : ""}`,
        "Admin → AI settings",
      );
    }
    case "ai.settings_changed":
      return say("changed the AI settings", "Admin → AI settings");
    case "ai.memory_cleared":
      return say("cleared what the assistant remembers", "My profile");
    case "ai.chats_deleted": {
      const n = num(d, "chats");
      return say(
        `deleted ${n === 1 ? "1 assistant chat" : `${n} assistant chats`}`,
        "My profile",
      );
    }
    case "ai.chat_deleted":
      return say("deleted an assistant chat", "Previous chats");
    case "account.timezone_changed": {
      const after = str(d, "after");
      return say(
        after
          ? `set their timezone to ${after}`
          : "went back to the company timezone",
        "My profile",
      );
    }
    case "settings.timezone_changed":
      return say(
        `changed the company timezone to ${str(d, "after") ?? "—"}`,
        "Admin → Settings",
      );
    case "user.created":
      return say(`added the account of ${target}`);
    case "user.updated":
      return say(`updated the account of ${target}`);
    case "user.deactivated":
      return say(`deactivated the account of ${target}`);
    case "user.reactivated":
      return say(`reactivated the account of ${target}`);
    case "role.granted":
      return say(`gave ${target} the ${roleLabel(str(d, "role"))} role`);
    case "role.revoked":
      return say(`took the ${roleLabel(str(d, "role"))} role from ${target}`);
  }
  return say(`recorded “${ev.action}”`);
}

/** Keys that are shown elsewhere or mean nothing to a reader. */
const HIDDEN_KEYS = new Set(["ticket_id", "before", "after", "changes"]);
/** Internal IDs (snapshot, signature, client…) mean nothing to a reader. */
const hidden = (key: string) => HIDDEN_KEYS.has(key) || key.endsWith("_id");
const ADDED = /_added$|^(employee|user)\.created$|^role\.granted$/;
const REMOVED = /^request\.(access|equipment|physical)_removed$/;

/**
 * What changed, for the details sheet: one row per field with before and
 * after (only fields that differ), from the event's stored values.
 */
export function eventChanges(ev: RawAuditEvent): ChangeRow[] {
  const d: Obj = isObj(ev.diff) ? ev.diff : {};
  const rows: ChangeRow[] = [];
  const pairs = (before: Obj, after: Obj, prefix = "") => {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    for (const key of keys) {
      const b = before[key];
      const a = after[key];
      if (isObj(b) || isObj(a)) {
        pairs(isObj(b) ? b : {}, isObj(a) ? a : {}, `${fieldLabel(key)} · `);
        continue;
      }
      if (valueText(b) === valueText(a)) continue;
      rows.push({
        field: `${prefix}${fieldLabel(key)}`,
        before: valueText(b),
        after: valueText(a),
      });
    }
  };

  if (ev.action === "request.state_changed") {
    rows.push({
      field: "State",
      before: valueText(d.from),
      after: valueText(d.to),
    });
  } else if (isObj(d.changes)) {
    for (const [key, change] of Object.entries(d.changes)) {
      const c: Obj = isObj(change) ? change : {};
      rows.push({
        field: fieldLabel(key),
        before: valueText(c.before),
        after: valueText(c.after),
      });
    }
  } else if (isObj(d.before) || isObj(d.after)) {
    pairs(obj(d, "before"), obj(d, "after"));
  } else if ("before" in d || "after" in d) {
    const field =
      ev.action === "request.mailbox_set"
        ? "Mailbox"
        : ev.action === "request.equipment_return_set"
          ? "Return"
          : ev.action.endsWith("timezone_changed")
            ? "Timezone"
            : "Value";
    rows.push({
      field,
      before: valueText(d.before),
      after: valueText(d.after),
    });
  } else if (ADDED.test(ev.action) || REMOVED.test(ev.action)) {
    const added = ADDED.test(ev.action);
    for (const [key, value] of Object.entries(d)) {
      if (hidden(key) || value === null) continue;
      rows.push({
        field: fieldLabel(key),
        before: added ? "—" : valueText(value),
        after: added ? valueText(value) : "—",
      });
    }
  }
  return rows;
}

/** The other stored values (file, fingerprint, reason…) as label / value. */
export function eventFacts(
  ev: RawAuditEvent,
): { label: string; value: string }[] {
  // Every value is already a change row.
  if (ADDED.test(ev.action) || REMOVED.test(ev.action)) return [];
  const d: Obj = isObj(ev.diff) ? ev.diff : {};
  const only = ev.action === "request.state_changed" ? ["reason"] : null;
  return Object.entries(d)
    .filter(
      ([key, value]) =>
        !hidden(key) &&
        (!only || only.includes(key)) &&
        value !== null &&
        !(isObj(value) && Object.keys(value).length === 0),
    )
    .map(([key, value]) => ({
      label: fieldLabel(key),
      value: valueText(value),
    }));
}
