import { tool } from "ai";
import * as z from "zod";
import { formatDate, formatDay, formatDayTime } from "@/lib/requests/format";
import { nationalityText, pdfFileName } from "@/lib/requests/signing";
import {
  STATE_LABELS,
  TYPE_LABELS,
  countryName,
  personName,
} from "@/lib/requests/labels";
import { IT_SIDE } from "./people-shared";
import {
  canCheckSigning,
  isOpen,
  parseTicket,
  requestLink,
  sectionNames,
} from "./request-shared";
import { defineTool, hasAnyRole } from "./types";
import { PAGES } from "@/lib/navigation";

const canOpenRecords = (roles: Parameters<typeof hasAnyRole>[0]) =>
  hasAnyRole(roles, PAGES.records.roles);

/**
 * "Where is UAM-2026-000375?", "What's missing on 374?" — one request: who
 * it is about, its status, what it holds, the approver's return comment and,
 * for IT, what Review & sign still needs. The IT side only.
 */
export const getRequest = defineTool({
  name: "getRequest",
  roles: IT_SIDE,
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "One request by its ticket (UAM-2026-000375, or just 375): the person, status, dates, office, how many applications / equipment / access items it has, the offboarding deadline, the approver's comment and flagged sections if it was returned, and (for IT) what is still missing before Review & sign.",
        "If a number matches tickets of several years, the result lists them: ask which one is meant.",
        "ALWAYS call getRequest when the person asks for a request's PDF, document or record, even if you listed it before: only this result has the PDF link.",
        "When pdfLink is in the result, a Download the PDF link shows ABOVE your answer, next to Open the request: say it is above; you can't attach files yourself. The file is called pdfFileName: never guess the name.",
      ].join(" "),
      inputSchema: z.object({
        ticket: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .describe("The ticket ID or its number."),
      }),
      execute: async ({ ticket }) => {
        const wanted = parseTicket(ticket);
        if (!wanted) {
          return {
            ticket,
            error:
              "That is not a ticket number. Ask for the ticket, for example UAM-2026-000375.",
          };
        }
        try {
          let query = ctx.db
            .from("requests")
            .select(
              "id, ticket_id, type, state, first_name, last_name, work_email, job_title, country, nationalities, effective_date, sla_due_at, created_at, updated_at, closed_at, office:offices(name), department:departments(name), assignee:app_users!requests_assignee_id_fkey(first_name, last_name)",
            )
            .eq("ticket_number", wanted.number)
            .order("ticket_year", { ascending: false });
          if (wanted.year) query = query.eq("ticket_year", wanted.year);
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          const found = data ?? [];
          if (found.length === 0) {
            return {
              ticket,
              error:
                "No request with that ticket is visible to you. Ask for the exact ticket.",
            };
          }
          if (found.length > 1) {
            return {
              ticket,
              error:
                "Several years have this ticket number. Ask which one is meant.",
              matches: found.map((r) => r.ticket_id),
            };
          }
          const r = found[0];

          const [apps, equipment, access, returned, checks] = await Promise.all(
            [
              ctx.db
                .from("request_access_items")
                .select("id", { count: "exact", head: true })
                .eq("request_id", r.id),
              ctx.db
                .from("request_equipment_items")
                .select("id", { count: "exact", head: true })
                .eq("request_id", r.id),
              ctx.db
                .from("request_physical_access_items")
                .select("id", { count: "exact", head: true })
                .eq("request_id", r.id),
              r.state === "returned"
                ? ctx.db
                    .from("approvals")
                    .select(
                      "comment, flagged_sections, decided_at, by:app_users!approvals_decided_by_fkey(first_name, last_name)",
                    )
                    .eq("request_id", r.id)
                    .eq("decision", "returned")
                    .order("decided_at", { ascending: false })
                    .limit(1)
                    .maybeSingle()
                : null,
              canCheckSigning(ctx.roles) && isOpen(r.state)
                ? ctx.db.rpc("signing_checks", { p_request_id: r.id })
                : null,
            ],
          );
          const check = (checks?.data ?? null) as {
            missing_fields?: string[];
            checklist_complete?: boolean;
          } | null;
          const ret = returned?.data ?? null;

          return {
            ticket: r.ticket_id,
            type: TYPE_LABELS[r.type],
            status: STATE_LABELS[r.state],
            person: personName(r.first_name, r.last_name) || "No name yet",
            email: r.work_email,
            jobTitle: r.job_title,
            department: r.department?.name ?? null,
            office: r.office?.name ?? null,
            country: r.country ? countryName(r.country) : null,
            nationality: nationalityText(r.nationalities) || null,
            effectiveDate: r.effective_date
              ? formatDate(r.effective_date)
              : null,
            deadline: r.sla_due_at
              ? formatDayTime(r.sla_due_at, ctx.timeZone)
              : null,
            assignedTo: r.assignee
              ? personName(r.assignee.first_name, r.assignee.last_name)
              : null,
            created: formatDay(r.created_at, ctx.timeZone),
            lastChange: formatDay(r.updated_at, ctx.timeZone),
            closed: r.closed_at ? formatDay(r.closed_at, ctx.timeZone) : null,
            items: {
              applications: apps.count ?? 0,
              equipment: equipment.count ?? 0,
              access: access.count ?? 0,
            },
            ...(ret
              ? {
                  returned: {
                    by: personName(ret.by?.first_name, ret.by?.last_name),
                    on: formatDay(ret.decided_at, ctx.timeZone),
                    comment: ret.comment,
                    flaggedSections: sectionNames(ret.flagged_sections),
                  },
                }
              : {}),
            ...(check && !checks?.error
              ? {
                  stillMissing: check.missing_fields ?? [],
                  section9Complete: check.checklist_complete ?? false,
                }
              : {}),
            link: requestLink(r.id, r.state),
            // The record PDF — for the people Records is for (admin, auditor).
            ...(r.state === "closed" && canOpenRecords(ctx.roles)
              ? {
                  pdfLink: `/records/${r.id}/pdf`,
                  // The name the PDF route gives the file (same function).
                  pdfFileName: pdfFileName(r.first_name, r.last_name, r.type),
                }
              : {}),
            source: `Request ${r.ticket_id}`,
          };
        } catch {
          return { ticket, error: "The request could not be read just now." };
        }
      },
    }),
});
