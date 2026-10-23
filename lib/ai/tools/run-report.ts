import { tool } from "ai";
import { parseItemKey } from "@/lib/reports/access";
import { loadAccessByItem, loadAccessHolders } from "@/lib/reports/access-load";
import { loadAllUsers, loadReportOptions } from "@/lib/reports/all-users";
import { reportInfo, type ReportSlug } from "@/lib/reports/catalog";
import { loadEmployeesByOffice } from "@/lib/reports/employees-load";
import {
  filterWords,
  rangeLabel,
  reportDays,
  reportNames,
  reportParams,
  type ReportFilters,
} from "@/lib/reports/filters";
import { monthLabel, summarise } from "@/lib/reports/months";
import { onboardedMonths, onboardedSpan } from "@/lib/reports/onboarded";
import { loadOnboardedBy } from "@/lib/reports/onboarded-by";
import { loadSlaReport } from "@/lib/reports/offboarding-sla";
import { loadOpenRequests } from "@/lib/reports/open-load";
import { loadSignatureLog } from "@/lib/reports/signature-log";
import {
  duration,
  reportInput,
  resolveReportFilters,
  type ReportInput,
} from "./report-filters";
import { defineTool, type ToolContext } from "./types";

/** The link to the same report with the same filters. */
function link(
  slug: ReportSlug,
  filters: ReportFilters,
  extra?: Record<string, string>,
) {
  const params = reportParams(filters);
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  const query = params.toString();
  return `/reports/${slug}${query ? `?${query}` : ""}`;
}

const slugFor = (input: ReportInput): ReportSlug => {
  switch (input.report) {
    case "onboarded":
      return input.groupBy && input.groupBy !== "month"
        ? (`onboarded-by-${input.groupBy}` as ReportSlug)
        : "onboarded-by-month";
    case "employees_by_office":
      return "employees-by-office";
    case "all_users":
      return "all-users";
    case "signature_log":
      return "signature-log";
    case "offboarding_sla":
      return "offboarding-sla";
    case "access_by_application":
      return "access-by-application";
    case "open_requests":
      return "open-requests";
  }
};

/** Today / right now reports have no period. */
const TODAY: ReportInput["report"][] = [
  "employees_by_office",
  "access_by_application",
  "open_requests",
];

async function run(input: ReportInput, ctx: ToolContext) {
  const options = await loadReportOptions(ctx.db);
  const { filters, unknown } = resolveReportFilters(input, options);
  if (unknown.length) {
    return {
      error: `Not found: ${unknown.join(", ")}. Ask the person which one they mean — never guess.`,
    };
  }
  const slug = slugFor(input);
  const info = reportInfo(slug);
  const today = TODAY.includes(input.report);
  const people = {
    timeZone: ctx.timeZone,
    canOpenRequests: ctx.roles.some(
      (r) => r === "admin" || r === "requester" || r === "it_operator",
    ),
    isApprover: ctx.roles.includes("approver"),
  };
  const head = {
    report: info.name,
    definition: info.definition,
    period: today ? "Today" : rangeLabel(reportDays(filters, ctx.timeZone)),
    filters: filterWords(filters, reportNames(options)),
    link: link(slug, filters),
  };

  switch (input.report) {
    case "onboarded": {
      const group = input.groupBy ?? "month";
      if (group === "month") {
        const span = await onboardedSpan(filters, ctx.timeZone, ctx.db);
        const months = await onboardedMonths(span, filters, ctx.db);
        return {
          ...head,
          period: `${monthLabel(span.first)} – ${monthLabel(span.last)}`,
          total: summarise(months).total,
          months: months.map((m) => ({
            month: monthLabel(m.month),
            onboarded: m.onboarded,
          })),
        };
      }
      const r = await loadOnboardedBy(group, filters, ctx.timeZone, ctx.db);
      return {
        ...head,
        total: r.total,
        groups: r.rows.map((g) => ({
          [group]: g.label,
          onboarded: g.onboarded,
          share: g.share,
        })),
      };
    }
    case "employees_by_office": {
      const r = await loadEmployeesByOffice(filters, ctx.db);
      return {
        ...head,
        employees: r.totals.employees,
        leaving: r.totals.leaving,
        offices: r.lines.map((l) => ({
          office: l.sub ? `  ${l.label}` : l.label,
          employees: l.employees,
          leaving: l.leaving,
          share: l.share,
        })),
      };
    }
    case "all_users": {
      const r = await loadAllUsers(filters, people, ctx.db);
      return {
        ...head,
        requests: r.total,
        people: r.people,
        firstRows: r.rows.map((x) => ({
          name: x.name,
          ticket: x.ticketId,
          type: x.type,
          status: x.state,
          office: x.office,
          dates: x.dates,
        })),
      };
    }
    case "signature_log": {
      const r = await loadSignatureLog(filters, people, ctx.db);
      return {
        ...head,
        signedByIt: r.total,
        approved: r.approved,
        returned: r.returned,
        medianTimeToApprove: duration(r.medianSeconds),
      };
    }
    case "offboarding_sla": {
      const r = await loadSlaReport(filters, people, ctx.db);
      return {
        ...head,
        offboardings: r.summary.total,
        met: r.summary.met,
        missed: r.summary.missed,
        metPercent: r.summary.metPercent,
        open: r.summary.open,
        overdue: r.summary.overdue,
      };
    }
    case "access_by_application": {
      const kind = input.accessKind ?? "application";
      const r = await loadAccessByItem(kind, filters, ctx.db);
      const kindLink = kind === "application" ? undefined : { kind };
      if (input.item) {
        const want = input.item.toLowerCase();
        const match =
          r.items.find((i) => i.name.toLowerCase() === want) ??
          r.items.find((i) => i.name.toLowerCase().includes(want));
        if (!match) {
          return {
            ...head,
            item: input.item,
            holders: 0,
            note: "Nobody holds it today (or it isn't in the catalog).",
          };
        }
        const key = parseItemKey(match.key);
        const holders = key
          ? await loadAccessHolders(kind, key, filters, people, ctx.db)
          : null;
        return {
          ...head,
          item: match.name,
          holders: match.holders,
          people: holders?.rows.map((h) => ({
            name: h.name,
            detail: h.detail,
            since: h.since,
            leaving: h.leaving
              ? `offboarding ${h.leaving.ticketId} open`
              : null,
          })),
          link: link("access-by-application", filters, {
            ...kindLink,
            item: match.key,
          }).replace(
            "/reports/access-by-application?",
            "/reports/access-by-application/holders?",
          ),
        };
      }
      return {
        ...head,
        link: link(slug, filters, kindLink),
        peopleWithAccess: r.totals.people,
        leaving: r.totals.leaving,
        items: r.items
          .slice(0, 20)
          .map((i) => ({ name: i.name, holders: i.holders })),
      };
    }
    case "open_requests": {
      const r = await loadOpenRequests(filters, people, ctx.db);
      return {
        ...head,
        filters: filters.type ? head.filters : [],
        open: r.summary.total,
        withApprover: r.summary.withApprover,
        withIt: r.summary.withIt,
        longestWaiting: r.summary.longest,
        overdueOffboardings: r.summary.overdue,
        byStatus: r.summary.groups.map((g) => ({
          status: g.title,
          count: g.rows.length,
        })),
      };
    }
  }
}

/**
 * Report questions ("How many people did we onboard in Dubai this year?"):
 * runs one of the Reports page's reports with the person's own access and
 * answers with the numbers, the filters and a link (PROJECT_PLAN §6.6).
 */
export const runReport = defineTool({
  name: "runReport",
  roles: ["admin", "approver", "auditor"],
  kind: "read",
  needsApproval: false,
  build: (ctx) =>
    tool({
      description: [
        "Run one of the app's reports and get its numbers. Use it for every question about counts, people, onboardings, offboardings, approvals, access or what is waiting.",
        "Answer only from what it returns, and name the report, period and filters you used as the source. Don't write the link: the app shows an Open the report link under your answer.",
        "If it returns an error about a name, ask the person which one they mean.",
      ].join(" "),
      inputSchema: reportInput,
      execute: async (input) => {
        try {
          return await run(input, ctx);
        } catch {
          return {
            error: "The report could not be loaded. Say so; don't guess.",
          };
        }
      },
    }),
});
