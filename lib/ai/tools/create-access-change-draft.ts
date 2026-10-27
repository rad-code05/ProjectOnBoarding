import { tool } from "ai";
import * as z from "zod";
import type { HeldItem } from "@/lib/requests/access-change";
import { loadAccessChange } from "@/lib/requests/access-change-load";
import { listLeavers } from "@/lib/requests/leavers";
import type { Json } from "@/lib/supabase/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import {
  ACCESS_CHANGE_TOPICS,
  accessChangePerson,
  askAboutAccessChange,
  resolveAccessChange,
  type AccessChangeInput,
  type ResolvedAccessChange,
} from "./access-change-shared";
import { onboardingInputSchema } from "./create-onboarding-draft";
import { loadFormOptions } from "./onboarding-load";
import { defineTool } from "./types";

const NO_REQUEST = "00000000-0000-0000-0000-000000000000";

/** What the person holds today, with the screen's own change / remove rules. */
export async function loadHeld(
  db: ServerSupabase,
  employeeId: string,
): Promise<HeldItem[]> {
  const { held } = await loadAccessChange(
    db,
    { id: NO_REQUEST, employee_id: employeeId },
    [],
  );
  return held;
}

export const heldChangeSchema = z.object({
  item: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("What they hold, as said: Slack, Figma, laptop, an asset tag."),
  action: z.enum(["change", "remove"]),
  to: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("For a change: the new role (application) or scope (access)."),
  reason: z.string().trim().max(80).optional(),
});

export const addSchema = onboardingInputSchema
  .pick({ applications: true, equipment: true, access: true })
  .partial();

export const accessChangeInputSchema = z.object({
  person: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .describe("Whose access changes: full name or work email, as said."),
  changes: z
    .array(heldChangeSchema)
    .max(40)
    .optional()
    .describe("Changes to what they hold today."),
  add: addSchema.optional().describe("Things they don't hold yet."),
  effectiveDate: z
    .string()
    .trim()
    .max(10)
    .optional()
    .describe("When the change takes effect, YYYY-MM-DD (company time)."),
  reasons: z.record(z.string(), z.string().max(80)).optional(),
});

/** Who, then what they hold, then every change checked (null = complete). */
async function resolveFor(
  input: AccessChangeInput,
  db: ServerSupabase,
): Promise<ResolvedAccessChange> {
  const person = accessChangePerson(await listLeavers(db), input.person);
  if ("problem" in person) return { ok: false, problems: [person.problem] };
  const [held, options] = await Promise.all([
    loadHeld(db, person.leaver.id),
    loadFormOptions(db),
  ]);
  return resolveAccessChange(input, person.leaver, held, options);
}

/**
 * Starts an access change for someone who holds something today (F16d-2):
 * new roles / scopes, removals and returns on what they hold, anything new,
 * and the effective date — each a suggestion they accept on the form. A
 * write: the person sees every change and Confirms. Admin / requester.
 */
export const createAccessChangeDraft = defineTool({
  name: "createAccessChangeDraft",
  roles: ["admin", "requester"],
  kind: "write",
  needsApproval: true,
  precheck: async (input, ctx) => {
    const parsed = accessChangeInputSchema.safeParse(input);
    if (!parsed.success) return "The input is not valid. Call again.";
    const ask = askAboutAccessChange(parsed.data as AccessChangeInput);
    if (ask) return ask;
    try {
      const resolved = await resolveFor(
        parsed.data as AccessChangeInput,
        ctx.db,
      );
      return resolved.ok
        ? null
        : `Not shown to the person yet. Ask about these, then call again: ${resolved.problems.join(" ")}`;
    } catch {
      return "What the person holds could not be read just now. Say so and try again later.";
    }
  },
  build: (ctx) =>
    tool({
      description: [
        "Start an access change for someone who works here (new role or scope, remove or return something they hold, or add something new). The person sees every change and must Confirm first; each change arrives on the form as a suggestion.",
        `Before calling: cover ${Object.values(ACCESS_CHANGE_TOPICS).join(" and ")}. getPersonAccess shows what they hold; use those names. Only roles and scopes the item offers; something they already hold is a change, not something new.`,
        "Never sign, approve or tick section 9.",
      ].join(" "),
      inputSchema: accessChangeInputSchema,
      execute: async (input) => {
        let resolved;
        try {
          resolved = await resolveFor(input as AccessChangeInput, ctx.db);
        } catch {
          return {
            created: false,
            error: "What the person holds could not be read just now.",
          };
        }
        if (!resolved.ok)
          return {
            created: false,
            problems: resolved.problems,
            note: "Nothing was created. Ask about these, then call again.",
          };
        const started = await ctx.db.rpc("ai_start_request", {
          p_type: "access_modification",
          p_employee_id: resolved.leaver.id,
        });
        if (started.error || !started.data)
          return {
            created: false,
            error:
              "The access change could not be started (one may already be open).",
          };
        const id = started.data;
        const [saved, ticket] = await Promise.all([
          ctx.db.rpc("suggest_request_values", {
            p_request_id: id,
            p_suggestions: resolved.suggestions as unknown as Json,
          }),
          ctx.db.from("requests").select("ticket_id").eq("id", id).single(),
        ]);
        return {
          created: true,
          person: resolved.leaver.name,
          ticket: ticket.data?.ticket_id ?? null,
          link: `/requests/${id}`,
          suggestions: saved.error ? 0 : (saved.data ?? 0),
        };
      },
    }),
});
