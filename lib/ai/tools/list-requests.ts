import { tool } from "ai";
import * as z from "zod";
import { formatDate, formatDay } from "@/lib/requests/format";
import {
  REQUEST_STATES,
  REQUEST_TYPES,
  STATE_LABELS,
  TYPE_LABELS,
  personName,
} from "@/lib/requests/labels";
import { IT_SIDE, OPEN_STATES } from "./people-shared";
import { canCheckSigning, isOpen } from "./request-shared";
import { defineTool } from "./types";

const MAX_ROWS = 25;

/**
 * "What's still missing on my drafts?", "Which offboardings are open?" —
 * requests the person may see (RLS), newest change first; for IT, what
 * each open one still needs before Review & sign. The IT side only.
 */
export const listRequests = defineTool({
  name: "listRequests",
  roles: IT_SIDE,
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "List requests, newest change first: ticket, type, status, the person, office, effective date, offboarding deadline.",
        "Filter by type, status ('open' = draft, in execution, awaiting confirmation or returned), only the ones the asking person created (mine), or a person's name / email / ticket (search).",
        "For IT, each open request also lists what is still missing before Review & sign — so 'what is missing on my drafts' is ONE call with mine and status open.",
      ].join(" "),
      inputSchema: z.object({
        type: z.enum(REQUEST_TYPES).optional(),
        status: z
          .enum(["open", ...REQUEST_STATES])
          .optional()
          .describe("A status, or 'open' for every status still in progress."),
        mine: z
          .boolean()
          .default(false)
          .describe("Only requests the asking person created."),
        search: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .optional()
          .describe("Part of the person's name, work email or the ticket ID."),
      }),
      execute: async ({ type, status, mine, search }) => {
        try {
          let query = ctx.db
            .from("requests")
            .select(
              "id, ticket_id, type, state, first_name, last_name, work_email, effective_date, sla_due_at, updated_at, office:offices(name)",
              { count: "exact" },
            )
            .order("updated_at", { ascending: false })
            .limit(MAX_ROWS);
          if (type) query = query.eq("type", type);
          if (status === "open") query = query.in("state", OPEN_STATES);
          else if (status) query = query.eq("state", status);
          if (mine) query = query.eq("created_by", ctx.userId);
          for (const word of (search ?? "").split(/\s+/).filter(Boolean)) {
            const term = word.replace(/[%*,()]/g, "");
            if (!term) continue;
            query = query.or(
              ["first_name", "last_name", "work_email", "ticket_id"]
                .map((c) => `${c}.ilike.*${term}*`)
                .join(","),
            );
          }
          const { data, error, count } = await query;
          if (error) throw new Error(error.message);

          const rows = data ?? [];
          const checks = canCheckSigning(ctx.roles);
          const missing = new Map<string, string[]>();
          if (checks) {
            await Promise.all(
              rows
                .filter((r) => isOpen(r.state))
                .map(async (r) => {
                  const res = await ctx.db.rpc("signing_checks", {
                    p_request_id: r.id,
                  });
                  const json = res.data as { missing_fields?: string[] } | null;
                  if (!res.error) missing.set(r.id, json?.missing_fields ?? []);
                }),
            );
          }
          return {
            total: count ?? rows.length,
            shown: rows.length,
            requests: rows.map((r) => ({
              ticket: r.ticket_id,
              type: TYPE_LABELS[r.type],
              status: STATE_LABELS[r.state],
              person:
                personName(r.first_name, r.last_name) ||
                r.work_email ||
                "No name yet",
              office: r.office?.name ?? null,
              effectiveDate: r.effective_date
                ? formatDate(r.effective_date)
                : null,
              deadline: r.sla_due_at
                ? formatDay(r.sla_due_at, ctx.timeZone)
                : null,
              lastChange: formatDay(r.updated_at, ctx.timeZone),
              ...(missing.has(r.id) ? { stillMissing: missing.get(r.id) } : {}),
            })),
            note: checks
              ? "stillMissing = what Review & sign would still ask for (empty = nothing missing)."
              : undefined,
            source: "Requests list",
          };
        } catch {
          return { error: "The requests could not be read just now." };
        }
      },
    }),
});
