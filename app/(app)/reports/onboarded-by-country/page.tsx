import { GroupReport } from "@/components/reports/GroupReport";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { parseReportFilters } from "@/lib/reports/filters";
import { companyTimezone } from "@/lib/time/display";
import { countOnboardedBy } from "../actions";

export const metadata = { title: "Onboarded by country" };

/** Report: closed onboardings per country (D16; board: Phone · Onboarded by country). */
export default async function OnboardedByCountryPage({
  searchParams,
}: PageProps<"/reports/onboarded-by-country">) {
  await requireRole(...PAGES.reports.roles);
  const filters = {
    ...parseReportFilters(await searchParams),
    type: null,
    q: "",
  };
  return (
    <GroupReport
      group="country"
      filters={filters}
      timeZone={await companyTimezone()}
      count={countOnboardedBy.bind(null, "country")}
    />
  );
}
