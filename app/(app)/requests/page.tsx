import Link from "next/link";
import { EmptyRequestsSwitch } from "@/components/requests/EmptyRequestsSwitch";
import { RequestFilters } from "@/components/requests/RequestFilters";
import { RequestList } from "@/components/requests/RequestList";
import { NewRequestButton } from "@/components/requests/NewRequestButton";
import { Button, SummaryTile, buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createDraft } from "./actions";
import { PAGES } from "@/lib/navigation";
import {
  PAGE_SIZE,
  hasActiveFilters,
  parseFilters,
} from "@/lib/requests/filters";
import { listRequests, requestSummary } from "@/lib/requests/list";

export const metadata = { title: "Requests" };

export default async function RequestsPage({
  searchParams,
}: PageProps<"/requests">) {
  await requireRole(...PAGES.requests.roles);
  const filters = parseFilters(await searchParams);
  const [{ rows, total }, counts] = await Promise.all([
    listRequests(filters),
    requestSummary(),
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
          <form action={createDraft} className="md:order-2">
            <NewRequestButton fullWidth className="md:h-10 md:text-[13px]" />
          </form>
          <Button
            variant="secondary"
            disabled
            title="Batch onboarding arrives with the Laine assistant"
            className="md:order-1 md:h-10 md:text-[13px]"
          >
            Batch onboarding
          </Button>
        </div>
      </div>

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
          value="—"
          note="Counted once requests can be signed"
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
