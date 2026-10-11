import Link from "next/link";
import { RecordList } from "@/components/records/RecordList";
import { RequestFilters } from "@/components/requests/RequestFilters";
import { buttonStyles } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { listRecords } from "@/lib/records/list";
import {
  PAGE_SIZE,
  hasActiveFilters,
  parseFilters,
} from "@/lib/requests/filters";

export const metadata = { title: "Records" };

/** Closed requests and their PDF records (board: Phone · Records). */
export default async function RecordsPage({
  searchParams,
}: PageProps<"/records">) {
  await requireRole(...PAGES.records.roles);
  const filters = parseFilters(await searchParams);
  const { rows, total } = await listRecords(filters);

  const moreParams = new URLSearchParams();
  if (filters.q) moreParams.set("q", filters.q);
  if (filters.type) moreParams.set("type", filters.type);
  moreParams.set("limit", String(filters.limit + PAGE_SIZE));
  const filtered = hasActiveFilters({
    ...filters,
    status: null,
    country: null,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] leading-tight md:text-[32px]">
          Records
        </h1>
        <p className="text-sm leading-normal text-graphite">
          Closed requests and their signed PDF record. A PDF exists only once a
          request is approved.
        </p>
      </div>

      <RequestFilters />

      {rows.length > 0 ? (
        <>
          <span className="text-xs font-semibold text-graphite">
            {total} record{total === 1 ? "" : "s"}
          </span>
          <RecordList rows={rows} />
          {total > rows.length && (
            <Link
              href={`/records?${moreParams}`}
              scroll={false}
              className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
            >
              Show more
            </Link>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">
            {filtered ? "No records match" : "No records yet"}
          </h2>
          <p className="text-sm text-graphite">
            {filtered
              ? "Try another name, email or ticket, or show all types."
              : "A record appears here when the approver confirms, signs and closes a request."}
          </p>
        </div>
      )}
    </div>
  );
}
