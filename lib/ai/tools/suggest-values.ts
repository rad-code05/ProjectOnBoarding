import { tool } from "ai";
import * as z from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { onboardingInputSchema } from "./create-onboarding-draft";
import { loadFormOptions } from "./onboarding-load";
import {
  heldSuggestions,
  addedSuggestions,
  type HeldChangeInput,
} from "./access-change-shared";
import {
  addSchema,
  heldChangeSchema,
  loadHeld,
} from "./create-access-change-draft";
import { offboardingInputSchema } from "./create-offboarding-draft";
import { offboardingFields } from "./offboarding-shared";
import { resolveOnboarding, type OnboardingInput } from "./onboarding-shared";
import { parseTicket } from "./request-shared";
import { defineTool } from "./types";

const EDITABLE = ["draft", "in_execution", "returned"];

/**
 * More values for an onboarding that already exists (F16c-2): "add the work
 * email", "also GitHub Member". Each value becomes a suggestion the person
 * accepts on the form — nothing on the request changes until then, so no
 * Confirm (a newer suggestion for the same field replaces the waiting one).
 * Names are checked like createOnboardingDraft. Admin / requester; open
 * onboardings only (offboarding and access change come with F16d).
 */
export const suggestValues = defineTool({
  name: "suggestValues",
  roles: ["admin", "requester"],
  kind: "propose",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Add or change values on an onboarding that already exists, by its ticket: each value becomes a suggestion the person accepts on the form (nothing changes before that).",
        "Use it for 'add the email', 'also give her GitHub', 'the start date is the 9th'. Same names as createOnboardingDraft (getFormOptions, getCatalog); only the values to add or change.",
        "The form has one work email: if two are given, ask which one. Never asset tags, section 9 or signing.",
      ].join(" "),
      inputSchema: z.object({
        ticket: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .describe("The request's ticket, e.g. UAM-2026-000404."),
        values: onboardingInputSchema
          .omit({ notNeeded: true })
          .partial()
          .optional()
          .describe("Onboarding only: the values to add or change."),
        accessChange: z
          .object({
            changes: z.array(heldChangeSchema).max(40).optional(),
            add: addSchema.optional(),
          })
          .optional()
          .describe(
            "Access change only: changes to what they hold, or something new.",
          ),
        offboarding: offboardingInputSchema
          .omit({ person: true, notNeeded: true })
          .optional()
          .describe(
            "Offboarding only: the timing and handover to add or change.",
          ),
      }),
      execute: async ({ ticket, values, offboarding, accessChange }) => {
        const save = async (
          r: { id: string; ticket_id: string },
          suggestions: unknown[],
        ) => {
          const saved = await ctx.db.rpc("suggest_request_values", {
            p_request_id: r.id,
            p_suggestions: suggestions as unknown as Json,
          });
          if (saved.error)
            return {
              added: 0,
              ticket: r.ticket_id,
              error:
                "The suggestions could not be saved (this request may be closed).",
            };
          return {
            added: saved.data ?? suggestions.length,
            ticket: r.ticket_id,
            link: `/requests/${r.id}`,
          };
        };
        const wanted = parseTicket(ticket);
        if (!wanted)
          return {
            added: 0,
            error: "That is not a ticket number. Ask for the ticket.",
          };
        let query = ctx.db
          .from("requests")
          .select("id, ticket_id, type, state, employee_id")
          .eq("ticket_number", wanted.number)
          .order("ticket_year", { ascending: false });
        if (wanted.year) query = query.eq("ticket_year", wanted.year);
        const found = await query;
        if (found.error)
          return { added: 0, error: "The request could not be read just now." };
        const rows = found.data ?? [];
        if (rows.length === 0)
          return {
            added: 0,
            error: "No request with that ticket is visible to you.",
          };
        if (rows.length > 1)
          return {
            added: 0,
            error:
              "Several years have this ticket number. Ask which one is meant.",
            matches: rows.map((r) => r.ticket_id),
          };
        const r = rows[0];
        if (!EDITABLE.includes(r.state))
          return {
            added: 0,
            ticket: r.ticket_id,
            error: "This request can't be changed any more.",
          };
        if (r.type === "offboarding") {
          const fields = offboardingFields(offboarding ?? {}, ctx.timeZone);
          if (fields.problems.length || fields.suggestions.length === 0)
            return {
              added: 0,
              ticket: r.ticket_id,
              problems: fields.problems,
              note: "On an offboarding only the timing and handover can be suggested (pass offboarding). Nothing was added.",
            };
          return save(r, fields.suggestions);
        }
        if (r.type === "access_modification") {
          if (!r.employee_id)
            return {
              added: 0,
              ticket: r.ticket_id,
              error: "This access change has no person.",
            };
          let held, opts;
          try {
            [held, opts] = await Promise.all([
              loadHeld(ctx.db, r.employee_id),
              loadFormOptions(ctx.db),
            ]);
          } catch {
            return {
              added: 0,
              error: "What the person holds could not be read just now.",
            };
          }
          const changes = heldSuggestions(
            (accessChange?.changes ?? []) as HeldChangeInput[],
            held,
          );
          const added = addedSuggestions(accessChange?.add, held, opts);
          const extra = resolveOnboarding(
            // The effective date ("startDate" in the shared values).
            { startDate: values?.startDate },
            opts,
          );
          const problems = [...changes.problems, ...added.problems];
          const all = [
            ...changes.suggestions,
            ...added.suggestions,
            ...(extra.ok ? extra.suggestions : []),
          ];
          if (problems.length || all.length === 0)
            return {
              added: 0,
              ticket: r.ticket_id,
              problems,
              note: "On an access change pass accessChange (changes / add). Nothing was added.",
            };
          return save(r, all);
        }

        let options;
        try {
          options = await loadFormOptions(ctx.db);
        } catch {
          return {
            added: 0,
            error: "The form's lists could not be read just now.",
          };
        }
        const resolved = resolveOnboarding(
          (values ?? {}) as OnboardingInput,
          options,
        );
        if (!resolved.ok)
          return {
            added: 0,
            ticket: r.ticket_id,
            problems: resolved.problems,
            note: "Nothing was added. Ask about these, then call again.",
          };
        if (resolved.suggestions.length === 0)
          return {
            added: 0,
            ticket: r.ticket_id,
            note: "There was nothing to add.",
          };

        return save(r, resolved.suggestions);
      },
    }),
});
