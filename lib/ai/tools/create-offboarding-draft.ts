import { tool } from "ai";
import * as z from "zod";
import { listLeavers } from "@/lib/requests/leavers";
import type { Json } from "@/lib/supabase/database.types";
import {
  askAboutOffboarding,
  OFFBOARDING_TOPICS,
  resolveOffboarding,
  type OffboardingInput,
} from "./offboarding-shared";
import { defineTool } from "./types";

const optional = (what: string, max = 120) =>
  z.string().trim().max(max).optional().describe(what);

export const offboardingInputSchema = z.object({
  person: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .describe("Who is leaving: full name or work email, as said."),
  lastWorkingDay: optional("Last working day, YYYY-MM-DD (company time).", 10),
  slaTimeline: z
    .enum(["same_day", "within_24h", "within_48h"])
    .optional()
    .describe("When access must be removed after the cut-off."),
  cutoffDate: optional("Access cut-off day, YYYY-MM-DD (company time).", 10),
  cutoffTime: optional("Access cut-off time, HH:MM (company time).", 5),
  handoverTo: optional("Who gets their data and mailbox (a name)."),
  notNeeded: z
    .array(z.enum(["handoverTo"]))
    .optional()
    .describe("Only when the person says no handover is needed."),
  reasons: z
    .record(z.string(), z.string().max(80))
    .optional()
    .describe("Why a value was chosen, by topic ('“Friday”', 'you said so')."),
});

/**
 * Starts an offboarding draft for someone who holds something today
 * (F16d-1, board *Offboarding by chat*). A write: the person sees every
 * value and Confirms. The database pre-fills the removals from what they
 * hold (create_offboarding); the SLA set-up and the handover arrive as
 * suggestions. Admin / requester. The removal method per app and the
 * mailbox are chosen during execution, never by the robot.
 */
export const createOffboardingDraft = defineTool({
  name: "createOffboardingDraft",
  roles: ["admin", "requester"],
  kind: "write",
  needsApproval: true,
  precheck: async (input, ctx) => {
    const parsed = offboardingInputSchema.safeParse(input);
    if (!parsed.success) return "The input is not valid. Call again.";
    const ask = askAboutOffboarding(parsed.data as OffboardingInput);
    if (ask) return ask;
    try {
      const resolved = resolveOffboarding(
        parsed.data as OffboardingInput,
        await listLeavers(ctx.db),
        ctx.timeZone,
      );
      return resolved.ok
        ? null
        : `Not shown to the person yet. Ask about these, then call again: ${resolved.problems.join(" ")}`;
    } catch {
      return "The people on record could not be read just now. Say so and try again later.";
    }
  },
  build: (ctx) =>
    tool({
      description: [
        "Start an offboarding draft for someone who is leaving. The database pre-fills what to remove from everything they hold today; you only set the timing and the handover. The person sees every value and must Confirm first.",
        `Before calling: cover ${Object.values(OFFBOARDING_TOPICS).join(", ")} — ask about each one not given yet in one short numbered list. Turn relative dates into real dates (company time). If the call is refused with "Ask about", ask exactly that.`,
        "The removal method per application and the mailbox are chosen by IT during execution — say so if asked. Never sign, approve or tick section 9.",
      ].join(" "),
      inputSchema: offboardingInputSchema,
      execute: async (input) => {
        let resolved;
        try {
          resolved = resolveOffboarding(
            input as OffboardingInput,
            await listLeavers(ctx.db),
            ctx.timeZone,
          );
        } catch {
          return {
            created: false,
            error: "The people on record could not be read just now.",
          };
        }
        if (!resolved.ok)
          return {
            created: false,
            problems: resolved.problems,
            note: "Nothing was created. Ask about these, then call again.",
          };
        const started = await ctx.db.rpc("ai_start_request", {
          p_type: "offboarding",
          p_employee_id: resolved.leaver.id,
        });
        if (started.error || !started.data)
          return {
            created: false,
            error:
              "The offboarding could not be started (one may already be open).",
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
          removals: resolved.leaver.items,
          suggestions: saved.error ? 0 : (saved.data ?? 0),
        };
      },
    }),
});
