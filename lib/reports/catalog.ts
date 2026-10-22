/**
 * Every report type, in display order (board: Phone · Reports). One list
 * drives the report picker, the desktop side panel and each report's header,
 * so a definition is written once. `ready: false` = built in a later feature.
 */
export type ReportSlug =
  | "all-users"
  | "onboarded-by-month"
  | "onboarded-by-country"
  | "onboarded-by-department"
  | "onboarded-by-office"
  | "employees-by-office"
  | "signature-log"
  | "offboarding-sla"
  | "access-by-application"
  | "open-requests";

export type ReportInfo = {
  slug: ReportSlug;
  /** Name in the audit log (report.exported entity id). */
  key: string;
  group: "People" | "Sign-off & compliance";
  name: string;
  desc: string;
  /** Exactly how the report counts — shown on the report. */
  definition: string;
  ready: boolean;
};

export const REPORTS: ReportInfo[] = [
  {
    slug: "all-users",
    key: "all_users",
    group: "People",
    name: "All users list",
    desc: "Everyone with a request: type, status, effective and closed dates",
    definition:
      "Everyone with an onboarding, offboarding or access-change request created in the period, newest first. Cancelled requests are left out.",
    ready: true,
  },
  {
    slug: "onboarded-by-month",
    key: "onboarded_by_month",
    group: "People",
    name: "Onboarded by month",
    desc: "Onboardings closed by the approver, per month",
    definition:
      "Onboarding requests the approver confirmed, signed and closed in the month (company timezone). Drafts, open and cancelled requests are not counted.",
    ready: true,
  },
  {
    slug: "onboarded-by-country",
    key: "onboarded_by_country",
    group: "People",
    name: "Onboarded by country",
    desc: "Closed onboardings grouped by country",
    definition:
      "Onboarding requests the approver confirmed, signed and closed in the period (company timezone), grouped by the country on the request.",
    ready: true,
  },
  {
    slug: "onboarded-by-department",
    key: "onboarded_by_department",
    group: "People",
    name: "Onboarded by department",
    desc: "Closed onboardings grouped by department / team",
    definition:
      "Onboarding requests the approver confirmed, signed and closed in the period (company timezone), grouped by the department on the request.",
    ready: true,
  },
  {
    slug: "onboarded-by-office",
    key: "onboarded_by_office",
    group: "People",
    name: "Onboarded by office",
    desc: "Closed onboardings grouped by office",
    definition:
      'Onboarding requests the approver confirmed, signed and closed in the period (company timezone), grouped by the office on the request. Requests from before the office field are counted as "Office not set".',
    ready: true,
  },
  {
    slug: "employees-by-office",
    key: "employees_by_office",
    group: "People",
    name: "Employees by office",
    desc: "Headcount today per office, the US by state and city",
    definition:
      "People employed today — an onboarding closed by the approver and no closed offboarding since — per office, from their latest closed request. People with an open offboarding still count, marked Leaving.",
    ready: true,
  },
  {
    slug: "signature-log",
    key: "signature_log",
    group: "Sign-off & compliance",
    name: "Signature log",
    desc: "When IT signed, when the approver confirmed, time to approve",
    definition:
      "Every request IT first signed (Review & sign) in the period, newest first. Time to approve runs from the first Review & sign to the approver's confirmation, returns included. Server times, company timezone.",
    ready: true,
  },
  {
    slug: "offboarding-sla",
    key: "offboarding_sla",
    group: "Sign-off & compliance",
    name: "Offboarding SLA",
    desc: "Agreed removal time against actual: met or missed, with reason",
    definition:
      "Offboardings whose access-removal deadline falls in the period (company timezone) — upcoming deadlines included — once execution has started. Met = the last access removal was ticked before the deadline (server time). Equipment returns are not part of the SLA. Cancelled offboardings are left out.",
    ready: true,
  },
  {
    slug: "access-by-application",
    key: "access_by_application",
    group: "Sign-off & compliance",
    name: "Access by application",
    desc: "Who holds access to each tool today",
    definition:
      "Who holds each application, device or access type today, from the access inventory — what closed requests granted and no closed request has removed yet. Staff from before the app appear once the Excel import is done.",
    ready: true,
  },
  {
    slug: "open-requests",
    key: "open_requests",
    group: "Sign-off & compliance",
    name: "Open requests by status",
    desc: "Where work is waiting",
    definition:
      'Every request that is not closed or cancelled, right now, grouped by status. "Waiting" = time since the request reached its current status (server time). Approvers see the requests waiting for them and the returned ones.',
    ready: true,
  },
];

export const REPORT_GROUPS = ["People", "Sign-off & compliance"] as const;

export function reportInfo(slug: ReportSlug): ReportInfo {
  return REPORTS.find((r) => r.slug === slug)!;
}
