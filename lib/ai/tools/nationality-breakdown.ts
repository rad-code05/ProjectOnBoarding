import { tool } from "ai";
import * as z from "zod";
import { countryName } from "@/lib/requests/labels";
import {
  DEFAULT_REPORT_FILTERS,
  rangeLabel,
  reportDays,
  reportRange,
  type ReportPeriod,
} from "@/lib/reports/filters";
import { defineTool } from "./types";

/** As many people as a report could ever hold — one call, no paging. */
const ALL = 10_000;

const PERIODS: Record<string, ReportPeriod> = {
  this_month: "month",
  last_3_months: "3m",
  last_12_months: "12m",
  all_time: "all",
};

export type NationalityCount = { code: string; people: number };

/**
 * Pure: people per nationality, most first (then by name). Someone with two
 * nationalities counts once under each; no nationality = "not set".
 */
export function countNationalities(
  people: readonly (readonly string[] | null)[],
): { people: number; notSet: number; groups: NationalityCount[] } {
  const count = new Map<string, number>();
  let notSet = 0;
  for (const codes of people) {
    const unique = [...new Set(codes ?? [])];
    if (unique.length === 0) notSet++;
    for (const c of unique) count.set(c, (count.get(c) ?? 0) + 1);
  }
  return {
    people: people.length,
    notSet,
    groups: [...count.entries()]
      .map(([code, n]) => ({ code, people: n }))
      .sort(
        (a, b) =>
          b.people - a.people ||
          countryName(a.code).localeCompare(countryName(b.code)),
      ),
  };
}

/**
 * "How many nationalities do our employees have?", "Nationalities of the
 * people onboarded this year" — counted from the report functions' own rows
 * (the database checks the reader; RLS decides what counts). Report readers
 * only, like runReport.
 */
export const nationalityBreakdown = defineTool({
  name: "nationalityBreakdown",
  roles: ["admin", "approver", "auditor"],
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Count people per nationality: employees today (who: employees), or people whose onboarding the approver closed in a period (who: onboarded).",
        "Someone with two nationalities counts under both, so the groups can add up to more than the people; notSet = no nationality recorded (requests from before the field existed).",
      ].join(" "),
      inputSchema: z.object({
        who: z.enum(["employees", "onboarded"]),
        period: z
          .enum(["this_month", "last_3_months", "last_12_months", "all_time"])
          .default("last_12_months")
          .describe("onboarded only; employees are counted today."),
      }),
      execute: async ({ who, period }) => {
        try {
          let rows: (string[] | null)[];
          let when: string;
          if (who === "employees") {
            const { data, error } = await ctx.db.rpc("report_employees", {
              p_limit: ALL,
            });
            if (error) throw new Error(error.message);
            rows = (data ?? []).map((r) => r.nationalities);
            when = "Today";
          } else {
            // Onboarded = closed by the approver in the period (D16).
            const filters = {
              ...DEFAULT_REPORT_FILTERS,
              period: PERIODS[period],
            };
            const range = reportRange(filters, ctx.timeZone);
            const { data, error } = await ctx.db.rpc("report_all_users", {
              p_type: "onboarding",
              p_limit: ALL,
            });
            if (error) throw new Error(error.message);
            rows = (data ?? [])
              .filter(
                (r) =>
                  r.state === "closed" &&
                  r.closed_at !== null &&
                  (!range.from ||
                    Date.parse(r.closed_at) >= Date.parse(range.from)) &&
                  (!range.to || Date.parse(r.closed_at) < Date.parse(range.to)),
              )
              .map((r) => r.nationalities);
            when = rangeLabel(reportDays(filters, ctx.timeZone));
          }
          const counted = countNationalities(rows);
          return {
            who: who === "employees" ? "Employees" : "Onboarded",
            period: when,
            people: counted.people,
            nationalities: counted.groups.length,
            groups: counted.groups.map((g) => ({
              nationality: countryName(g.code),
              people: g.people,
            })),
            notSet: counted.notSet,
            note: "Someone with two nationalities counts under both.",
            source:
              who === "employees"
                ? "Employees by office (people), today, by nationality"
                : `Onboarded (closed by the approver), ${when}, by nationality`,
          };
        } catch {
          return { error: "The nationalities could not be counted just now." };
        }
      },
    }),
});
