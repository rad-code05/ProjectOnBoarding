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
    ready: false,
  },
  {
    slug: "onboarded-by-country",
    key: "onboarded_by_country",
    group: "People",
    name: "Onboarded by country",
    desc: "Closed onboardings grouped by country",
    definition:
      "Onboarding requests closed by the approver in the period, grouped by the country on the request.",
    ready: false,
  },
  {
    slug: "onboarded-by-department",
    key: "onboarded_by_department",
    group: "People",
    name: "Onboarded by department",
    desc: "Closed onboardings grouped by department / team",
    definition:
      "Onboarding requests closed by the approver in the period, grouped by the department on the request.",
    ready: false,
  },
  {
    slug: "signature-log",
    key: "signature_log",
    group: "Sign-off & compliance",
    name: "Signature log",
    desc: "When IT signed, when the approver confirmed, time to approve",
    definition:
      "Every Review & sign and every confirmation, with server times and the time it took to approve.",
    ready: false,
  },
  {
    slug: "offboarding-sla",
    key: "offboarding_sla",
    group: "Sign-off & compliance",
    name: "Offboarding SLA",
    desc: "Agreed removal time against actual: met or missed, with reason",
    definition:
      "Offboardings with their agreed removal deadline and the time the last removal was ticked: met or missed, with the reason.",
    ready: false,
  },
  {
    slug: "access-by-application",
    key: "access_by_application",
    group: "Sign-off & compliance",
    name: "Access by application",
    desc: "Who holds access to each tool today",
    definition:
      "Everyone who holds access to each application today, from the access inventory (closed requests).",
    ready: false,
  },
  {
    slug: "open-requests",
    key: "open_requests",
    group: "Sign-off & compliance",
    name: "Open requests by status",
    desc: "Where work is waiting",
    definition: "Requests not yet closed or cancelled, by status.",
    ready: false,
  },
];

export const REPORT_GROUPS = ["People", "Sign-off & compliance"] as const;

export function reportInfo(slug: ReportSlug): ReportInfo {
  return REPORTS.find((r) => r.slug === slug)!;
}
