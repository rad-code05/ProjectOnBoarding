import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchGrid } from "@/components/requests/batch/BatchGrid";
import { ChevronLeftIcon } from "@/components/ui";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import { requireRole } from "@/lib/auth";
import { loadBatch } from "@/lib/requests/batch/store";
import { formatDay } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Batch" };

const KIND: Record<string, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  access_modification: "Access change",
};

/** A batch (F17b-3b): the grid with its checks, or the drafts it created. */
export default async function BatchPage({
  params,
}: PageProps<"/requests/batch/[id]">) {
  await requireRole("admin", "requester");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createServerSupabaseClient();
  const [batch, options, timeZone] = await Promise.all([
    loadBatch(db, id),
    loadFormOptions(db),
    displayTimezone(),
  ]);
  if (!batch) notFound();
  const kept = new Date(
    new Date(batch.createdAt).getTime() + 7 * 24 * 3600 * 1000,
  ).toISOString();
  const meta =
    batch.status === "created"
      ? `${batch.rows.length} people · created ${formatDay(batch.confirmedAt ?? batch.createdAt, timeZone)}`
      : `${batch.rows.length} people read · kept until ${formatDay(kept, timeZone)}`;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/requests"
          className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold"
        >
          <ChevronLeftIcon size={18} />
          Requests
        </Link>
        <span className="flex-1" />
        <span className="rounded-pill border border-ink px-2.5 py-0.5 text-[11px] font-semibold">
          {batch.status === "created" ? "Created" : "Not created yet"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Batch · {KIND[batch.type]}
        </span>
        <h1 className="font-serif text-[32px] leading-tight break-words">
          {batch.title}
        </h1>
        <span className="text-[13px] text-graphite">{meta}</span>
      </div>
      <BatchGrid
        batch={{
          id: batch.id,
          title: batch.title,
          status: batch.status,
          meta,
          rows: batch.rows.map((r) => ({
            id: r.id,
            position: r.position,
            included: r.included,
            values: r.data.values,
            other: r.data.other,
            problems: r.problems,
            requestId: r.requestId,
            ticketId: r.ticketId,
          })),
        }}
        departments={options.departments.map((d) => d.name)}
        offices={options.offices.map((o) => o.name)}
      />
    </div>
  );
}
