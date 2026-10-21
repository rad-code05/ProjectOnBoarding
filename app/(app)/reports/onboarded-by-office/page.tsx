import { GroupReport } from "@/components/reports/GroupReport";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { parseReportFilters } from "@/lib/reports/filters";
import { companyTimezone } from "@/lib/time/display";
import { countOnboardedBy } from "../actions";

export const metadata = { title: "Onboarded by office" };

/** Report: closed onboardings per office (D16, F27d; the Onboarded by country layout). */
export default async function OnboardedByOfficePage({
  searchParams,
}: PageProps<"/reports/onboarded-by-office">) {
  await requireRole(...PAGES.reports.roles);
  const filters = {
    ...parseReportFilters(await searchParams),
    type: null,
    q: "",
  };
  return (
    <GroupReport
      group="office"
      filters={filters}
      timeZone={await companyTimezone()}
      count={countOnboardedBy.bind(null, "office")}
    />
  );
}
