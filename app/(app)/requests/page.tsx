import Link from "next/link";
import { EmptyRequestsSwitch } from "@/components/requests/EmptyRequestsSwitch";
import { RequestFilters } from "@/components/requests/RequestFilters";
import { RequestList } from "@/components/requests/RequestList";
import { NewRequestMenu } from "@/components/requests/NewRequestSheet";
import { SummaryTile, buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import {
  PAGE_SIZE,
  hasActiveFilters,
  parseFilters,
} from "@/lib/requests/filters";
import { listMyBatches } from "@/lib/requests/batch/store";
import { listLeavers } from "@/lib/requests/leavers";
import { listRequests, requestSummary } from "@/lib/requests/list";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";
import { monthStart } from "@/lib/time/zoned";

export const metadata = { title: "Requests" };

export default async function RequestsPage({
  searchParams,
}: PageProps<"/requests">) {
  const user = await requireRole(...PAGES.requests.roles);
  // Batches: admin and requester (F17b).
  const canBatch = user.roles.some((r) => r === "admin" || r === "requester");
  const filters = parseFilters(await searchParams);
  const since = monthStart(await companyTimezone());
  const [{ rows, total }, counts, leavers, batches] = await Promise.all([
    listRequests(filters),
    requestSummary(since),
    listLeavers(),
    canBatch
      ? listMyBatches(createServerSupabaseClient())
      : Promise.resolve([]),
  ]);

  const moreParams = new URLSearchParams();
  for (const [key, value] of Object.entries({
    q: filters.q,
    type: filters.type ?? "",
    status: filters.status ?? "",
    country: filters.country ?? "",
  })) {
    if (value) moreParams.set(key, value);
  }
  moreParams.set("limit", String(filters.limit + PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
            Laine onboarding rights
          </span>
          <h1 className="font-serif text-[34px] leading-tight md:text-[32px]">
            Requests
          </h1>
          <p className="text-[13px] text-graphite md:text-xs">
            Everyone being onboarded, offboarded or changing access.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <div className="md:order-2">
            <NewRequestMenu
              leavers={leavers}
              className="md:h-10 md:text-[13px]"
            />
          </div>
          {canBatch && (
            <Link
              href="/requests/batch/new"
              className={`${buttonStyles("secondary", "md")} md:order-1 md:h-10 md:text-[13px]`}
            >
              Batch
            </Link>
          )}
        </div>
      </div>

      {batches.length > 0 && (
        <section
          aria-label="Your batches"
          className="bg-white flex flex-col gap-2 rounded-card border border-line-subtle px-3.5 py-3"
        >
          <h2 className="text-[13px] font-semibold">Your batches</h2>
          <ul className="flex flex-col">
            {batches.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2.5 border-t border-line-subtle py-2 first:border-t-0"
              >
                <Link
                  href={`/requests/batch/${b.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold underline"
                >
                  {b.title}
                </Link>
                <span className="text-xs whitespace-nowrap text-graphite">
                  {b.rows} {b.rows === 1 ? "person" : "people"} ·{" "}
                  {b.status === "created" ? "created" : "not created yet"}
                </span>
              </li>
            ))}
          </ul>
          <span className="text-xs text-graphite">Kept 7 days.</span>
        </section>
      )}

      <section
        aria-label="Summary"
        className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3.5"
      >
        <SummaryTile label="Drafts" value={counts.draft} />
        <SummaryTile label="In execution" value={counts.inExecution} />
        <SummaryTile
          label="Awaiting Moises"
          value={counts.awaitingConfirmation}
        />
        <SummaryTile
          label="Onboarded this month"
          value={counts.onboardedThisMonth}
          note="Closed by the approver"
        />
      </section>

      <RequestFilters countries={counts.countries} />

      <EmptyRequestsSwitch
        nothingYet={counts.total === 0}
        noMatch={rows.length === 0 && hasActiveFilters(filters)}
      >
        <RequestList rows={rows} />
        <div className="flex flex-col items-center gap-2.5 md:flex-row-reverse md:justify-between">
          {total > rows.length && (
            <Link
              href={`/requests?${moreParams}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto`}
            >
              Show more
            </Link>
          )}
          <span className="text-xs text-graphite">
            Showing {rows.length} of {total}
          </span>
        </div>
      </EmptyRequestsSwitch>
    </div>
  );
}
