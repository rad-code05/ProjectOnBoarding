import { tool } from "ai";
import * as z from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { loadFormOptions } from "./onboarding-load";
import {
  askAbout,
  precheckOnboarding,
  resolveOnboarding,
  TOPICS,
  type OnboardingInput,
  type Topic,
} from "./onboarding-shared";
import { defineTool } from "./types";

const name = (what: string) => z.string().trim().min(1).max(120).describe(what);
const optional = (what: string, max = 120) =>
  z.string().trim().max(max).optional().describe(what);
const reason = optional(
  "Why, in a few words (shown next to the suggestion): 'you said so', 'usual for Engineering'.",
  80,
);

export const onboardingInputSchema = z.object({
  firstName: name("First name."),
  lastName: name("Last name."),
  workEmail: optional("Work email, e.g. meera.nair@laine.ai."),
  jobTitle: optional("Job title / role."),
  department: optional("A department exactly as getFormOptions lists it."),
  manager: optional("The manager's name as said."),
  office: optional("An office exactly as getFormOptions lists it."),
  state: optional("US office only: the state."),
  city: optional("US office only: the city (getFormOptions citySearch)."),
  nationalities: z
    .array(z.string().trim().min(2).max(60))
    .max(2)
    .optional()
    .describe("Up to two, as country names: India, Switzerland."),
  startDate: optional("Start date as YYYY-MM-DD (company time).", 10),
  priority: z.enum(["low", "medium", "high"]).optional(),
  applications: z
    .array(
      z.object({
        name: name("Application exactly as getCatalog lists it."),
        permission: optional(
          "One of its roles (getCatalog); several separated by '; ' only where allowed.",
        ),
        reason,
      }),
    )
    .max(40)
    .optional(),
  equipment: z
    .array(
      z.object({
        type: name("Equipment type as getFormOptions lists it."),
        description: optional("Model or details, if said.", 120),
        reason,
      }),
    )
    .max(10)
    .optional(),
  access: z
    .array(
      z.object({
        type: name("Access type as getFormOptions lists it."),
        scope: optional("One of its scopes."),
        reason,
      }),
    )
    .max(10)
    .optional(),
  notNeeded: z
    .array(z.enum(Object.keys(TOPICS) as [Topic, ...Topic[]]))
    .optional()
    .describe(
      "Topics the person said aren't needed for this joiner (never the office). Only after asking.",
    ),
  reasons: z
    .record(z.string(), z.string().max(80))
    .optional()
    .describe(
      "Why a field has its value, by field name (startDate: '“Monday”', manager: 'you said so').",
    ),
});

/**
 * Creates an onboarding draft and fills it with suggestions (F16c, board
 * *Confirm creates the draft*). A write: it waits for the person's Confirm
 * (the chat shows every value first). Names are checked against the form's
 * lists before anything is created; then the draft is created and every
 * value saved as a suggestion the person accepts on the form — audited
 * source = ai. Admin / requester. Never section 9, never signing.
 */
export const createOnboardingDraft = defineTool({
  name: "createOnboardingDraft",
  roles: ["admin", "requester"],
  kind: "write",
  needsApproval: true,
  // Nothing missed (Raju, 2026-10-26): every topic answered — or said not
  // needed — and every name found, before the person sees the Confirm card.
  precheck: async (input, ctx) => {
    const parsed = onboardingInputSchema.safeParse(input);
    if (!parsed.success) return "The input is not valid. Call again.";
    // Open topics first — no database needed for that.
    const ask = askAbout(parsed.data as OnboardingInput);
    if (ask) return ask;
    try {
      return precheckOnboarding(
        parsed.data as OnboardingInput,
        await loadFormOptions(ctx.db),
      );
    } catch {
      return "The form's lists could not be read just now. Say so and try again later.";
    }
  },
  build: (ctx) =>
    tool({
      description: [
        "Create an onboarding draft for a new joiner, with every value as a suggestion the person accepts on the form. The person sees all values and must Confirm first.",
        `Before calling: every onboarding covers ${Object.values(TOPICS).join(", ")}. Ask about each one not given yet, in one short numbered list, even when the person only asked for a quick draft; a topic the person says isn't needed goes in notNeeded. Turn relative dates into real dates (company time). If the call is refused with "Ask about", ask exactly that.`,
        "Use names exactly as getFormOptions and getCatalog list them; never guess a person, office, department, application or role — ask. Equipment asset tags and section 9 are never yours to fill.",
        "If the result lists problems, nothing was created: ask about them, then call again.",
      ].join(" "),
      inputSchema: onboardingInputSchema,
      execute: async (input) => {
        let options;
        try {
          options = await loadFormOptions(ctx.db);
        } catch {
          return {
            created: false,
            error: "The form's lists could not be read just now.",
          };
        }
        const resolved = resolveOnboarding(input, options);
        if (!resolved.ok) {
          return {
            created: false,
            problems: resolved.problems,
            note: "Nothing was created. Ask about these, then call again.",
          };
        }

        const started = await ctx.db.rpc("ai_start_request", {
          p_type: "onboarding",
        });
        if (started.error || !started.data) {
          return {
            created: false,
            error:
              "The draft could not be created (only admins and requesters can).",
          };
        }
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
          ticket: ticket.data?.ticket_id ?? null,
          link: `/requests/${id}`,
          suggestions: saved.error ? 0 : (saved.data ?? 0),
          ...(saved.error && {
            warning:
              "The draft was created, but the suggestions could not be saved. Say so; the person can fill the form by hand.",
          }),
        };
      },
    }),
});
