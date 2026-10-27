import { allowedActions } from "@/lib/requests/actions-by-type";
import { COUNTRY_CODES } from "@/lib/requests/countries";
import { countryName } from "@/lib/requests/labels";
import { normalize } from "./people-shared";

/**
 * Filling an onboarding by chat (F16c, pure): what the assistant read from
 * the conversation — names, not ids — checked against the form's own lists
 * (departments, offices, US states and cities, the catalog). The result is
 * the suggestions to save (`suggest_request_values()`), or the problems in
 * words the assistant can ask about. Nothing is guessed: an unknown name is
 * a problem, with what exists.
 */

export type OnboardingInput = {
  /** Required for a new draft (the schema says so); optional when adding. */
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  jobTitle?: string;
  department?: string;
  manager?: string;
  office?: string;
  state?: string;
  city?: string;
  nationalities?: string[];
  startDate?: string;
  priority?: "low" | "medium" | "high";
  applications?: { name: string; permission?: string; reason?: string }[];
  equipment?: { type: string; description?: string; reason?: string }[];
  access?: { type: string; scope?: string; reason?: string }[];
  /** Why a field has its value ("you said so", "“Monday”"), by field name. */
  reasons?: Partial<Record<FieldName, string>>;
  /** Topics the person said aren't needed (asked, and answered "no"). */
  notNeeded?: Topic[];
};

/** What every onboarding is asked about before the Confirm (Raju, 2026-10-26). */
export const TOPICS = {
  workEmail: "work email",
  jobTitle: "job title",
  department: "department",
  office: "office",
  manager: "manager",
  startDate: "start date",
  applications: "applications and their roles",
  equipment: "equipment",
  access: "physical / logical access (badge, VPN …)",
  nationalities: "nationality",
} as const;
export type Topic = keyof typeof TOPICS;

/**
 * The topics nobody answered yet — neither a value nor the person saying it
 * isn't needed. The office is never optional (the form requires it).
 */
export function missingTopics(input: OnboardingInput): Topic[] {
  const skipped = new Set(input.notNeeded ?? []);
  const given = (t: Topic) => {
    const v = input[t];
    return Array.isArray(v) ? v.length > 0 : Boolean(v?.toString().trim());
  };
  return (Object.keys(TOPICS) as Topic[]).filter(
    (t) => !given(t) && (t === "office" || !skipped.has(t)),
  );
}

/** Words for the model when something is missing or wrong (null = complete). */
export function askAbout(input: OnboardingInput): string | null {
  const missing = missingTopics(input);
  return missing.length
    ? `Not shown to the person yet. Ask about: ${missing.map((t) => TOPICS[t]).join(", ")} — in one short numbered list. Put a topic in notNeeded only when the person says it isn't needed. Then call again.`
    : null;
}

export function precheckOnboarding(
  input: OnboardingInput,
  options: FormOptions,
): string | null {
  const ask = askAbout(input);
  if (ask) return ask;
  const resolved = resolveOnboarding(input, options);
  return resolved.ok
    ? null
    : `Not shown to the person yet. Ask about these, then call again: ${resolved.problems.join(" ")}`;
}

export type FieldName =
  | "firstName"
  | "lastName"
  | "workEmail"
  | "jobTitle"
  | "department"
  | "manager"
  | "office"
  | "state"
  | "city"
  | "nationalities"
  | "startDate"
  | "priority";

export type FormOptions = {
  departments: { id: number; name: string }[];
  offices: {
    id: number;
    name: string;
    country: string;
    usesRegions: boolean;
  }[];
  /** US states (the office's country). */
  regions: { id: number; country: string; name: string }[];
  cities: { id: number; officeId: number; regionId: number; name: string }[];
  apps: {
    id: number;
    name: string;
    actions: string[];
    permissions: string[];
    multiple: boolean;
  }[];
  equipment: { id: number; name: string; actions: string[] }[];
  access: { id: number; name: string; actions: string[]; scopes: string[] }[];
};

export type Suggestion = {
  kind: "field" | "access" | "equipment" | "physical" | "held";
  target: string;
  value: unknown;
  reason?: string;
};

export type Resolved =
  { ok: true; suggestions: Suggestion[] } | { ok: false; problems: string[] };

const LIST = 12;
const some = (names: string[]) =>
  names.length > LIST
    ? `${names.slice(0, LIST).join(", ")} … (${names.length} in all)`
    : names.join(", ");

function byName<T extends { name: string }>(rows: T[], name: string) {
  const want = normalize(name);
  return rows.find((r) => normalize(r.name) === want);
}

/** "India", "IN", "Indian" → "IN"; null when not a country. */
export function countryCode(text: string): string | null {
  const t = normalize(text);
  if (/^[a-z]{2}$/.test(t) && COUNTRY_CODES.includes(t.toUpperCase()))
    return t.toUpperCase();
  return (
    COUNTRY_CODES.find((c) => normalize(countryName(c)) === t) ??
    // A nationality word: "Indian" → India, "Swiss" isn't (ask).
    COUNTRY_CODES.find(
      (c) => t.length >= 5 && t.startsWith(normalize(countryName(c))),
    ) ??
    null
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function resolveOnboarding(
  input: OnboardingInput,
  options: FormOptions,
): Resolved {
  const problems: string[] = [];
  const out: Suggestion[] = [];
  const why = (f: FieldName) => input.reasons?.[f]?.trim().slice(0, 200);
  const field = (f: FieldName, target: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    out.push({ kind: "field", target, value, reason: why(f) });
  };
  const text = (v?: string) => v?.trim() || undefined;

  field("firstName", "first_name", text(input.firstName));
  field("lastName", "last_name", text(input.lastName));
  const email = text(input.workEmail)?.toLowerCase();
  if (email && !EMAIL.test(email))
    problems.push(`"${email}" isn't a valid email address.`);
  else field("workEmail", "work_email", email);
  field("jobTitle", "job_title", text(input.jobTitle));
  field("manager", "manager_name", text(input.manager));
  field("priority", "priority", input.priority);

  if (text(input.startDate)) {
    if (!DAY.test(input.startDate!.trim()))
      problems.push(`The start date must be a day like 2026-10-26.`);
    else field("startDate", "effective_date", input.startDate!.trim());
  }

  if (text(input.department)) {
    const d = byName(options.departments, input.department!);
    if (!d)
      problems.push(
        `There is no department "${input.department}". Departments: ${some(options.departments.map((x) => x.name))}.`,
      );
    else field("department", "department_id", d.id);
  }

  if (text(input.office)) {
    const o = byName(options.offices, input.office!);
    if (!o) {
      problems.push(
        `There is no office "${input.office}". Offices: ${some(options.offices.map((x) => x.name))}.`,
      );
    } else {
      field("office", "office_id", o.id);
      // The office fills the work country (as on the form).
      field("office", "country", o.country);
      if (o.usesRegions && text(input.state)) {
        const r = byName(
          options.regions.filter((x) => x.country === o.country),
          input.state!,
        );
        if (!r) problems.push(`There is no state "${input.state}".`);
        else {
          field("state", "region_id", r.id);
          if (text(input.city)) {
            const cities = options.cities.filter(
              (c) => c.officeId === o.id && c.regionId === r.id,
            );
            const c = byName(cities, input.city!);
            if (!c)
              problems.push(
                `There is no city "${input.city}" in ${r.name} yet. An admin can add it on the form (City field). Cities there: ${some(cities.map((x) => x.name)) || "none yet"}.`,
              );
            else field("city", "office_city_id", c.id);
          }
        }
      } else if (o.usesRegions && text(input.city)) {
        problems.push(`Which state is ${input.city} in?`);
      }
    }
  }

  if (input.nationalities?.length) {
    const codes = input.nationalities.map((n) => [n, countryCode(n)] as const);
    const unknown = codes.filter(([, c]) => !c).map(([n]) => n);
    if (unknown.length)
      problems.push(
        `Nationality "${unknown.join('", "')}": write the country, e.g. India or Switzerland.`,
      );
    else if (codes.length > 2) problems.push("At most two nationalities.");
    else
      field("nationalities", "nationalities", [
        ...new Set(codes.map(([, c]) => c)),
      ]);
  }

  for (const a of input.applications ?? []) {
    const app = byName(options.apps, a.name);
    if (!app) {
      problems.push(
        `"${a.name}" isn't in the catalog. Applications: ${some(options.apps.map((x) => x.name))}. (An admin can add it in Admin → Applications.)`,
      );
      continue;
    }
    const action = allowedActions("onboarding", "app", app.actions)[0];
    if (!action) {
      problems.push(`${app.name} can't be granted on an onboarding.`);
      continue;
    }
    let permission: string | null = null;
    if (text(a.permission)) {
      const wanted = a.permission!.split(";").map((p) => p.trim());
      const found = wanted.map((w) =>
        app.permissions.find((p) => normalize(p) === normalize(w)),
      );
      if (found.some((p) => !p) || (!app.multiple && found.length > 1)) {
        problems.push(
          `${app.name} has no role "${a.permission}". Roles: ${app.permissions.join(", ")}${app.multiple ? " (several allowed)" : ""}.`,
        );
        continue;
      }
      permission = found.join("; ");
    } else if (app.permissions.length === 1) {
      permission = app.permissions[0];
    } else {
      problems.push(`Which ${app.name} role? ${app.permissions.join(", ")}.`);
      continue;
    }
    out.push({
      kind: "access",
      target: `app:${app.id}`,
      value: { action, permission },
      reason: text(a.reason),
    });
  }

  for (const e of input.equipment ?? []) {
    const type = byName(options.equipment, e.type);
    if (!type) {
      problems.push(
        `There is no equipment type "${e.type}". Types: ${some(options.equipment.map((x) => x.name))}.`,
      );
      continue;
    }
    const action = allowedActions("onboarding", "equipment", type.actions)[0];
    if (!action) {
      problems.push(`${type.name} can't be issued on an onboarding.`);
      continue;
    }
    out.push({
      kind: "equipment",
      target: `equipment:${type.id}`,
      value: { action, description: text(e.description) ?? null },
      reason: text(e.reason),
    });
  }

  for (const x of input.access ?? []) {
    const type = byName(options.access, x.type);
    if (!type) {
      problems.push(
        `There is no access type "${x.type}". Types: ${some(options.access.map((t) => t.name))}.`,
      );
      continue;
    }
    const action = allowedActions("onboarding", "access", type.actions)[0];
    let scope: string | null = null;
    if (text(x.scope)) {
      scope =
        type.scopes.find((s) => normalize(s) === normalize(x.scope!)) ?? null;
      if (!scope) {
        problems.push(
          `${type.name} has no scope "${x.scope}". Scopes: ${type.scopes.join(", ") || "none"}.`,
        );
        continue;
      }
    }
    if (!action) {
      problems.push(`${type.name} can't be granted on an onboarding.`);
      continue;
    }
    out.push({
      kind: "physical",
      target: `access:${type.id}`,
      value: { action, scope },
      reason: text(x.reason),
    });
  }

  // One suggestion per target (the database keeps the last one anyway).
  const seen = new Set<string>();
  const suggestions = out
    .reverse()
    .filter((s) => !seen.has(s.target) && seen.add(s.target))
    .reverse()
    .map((s) =>
      s.reason ? s : { kind: s.kind, target: s.target, value: s.value },
    );
  return problems.length ? { ok: false, problems } : { ok: true, suggestions };
}
