import { GroupReport } from "@/components/reports/GroupReport";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { parseReportFilters } from "@/lib/reports/filters";
import { companyTimezone } from "@/lib/time/display";
import { countOnboardedBy } from "../actions";

export const metadata = { title: "Onboarded by department" };

/** Report: closed onboardings per department (D16; same layout as Onboarded by country). */
export default async function OnboardedByDepartmentPage({
  searchParams,
}: PageProps<"/reports/onboarded-by-department">) {
  await requireRole(...PAGES.reports.roles);
  const filters = {
    ...parseReportFilters(await searchParams),
    type: null,
    q: "",
  };
  return (
    <GroupReport
      group="department"
      filters={filters}
      timeZone={await companyTimezone()}
      count={countOnboardedBy.bind(null, "department")}
    />
  );
}
