import Link from "next/link";
import { ImportUpload } from "@/components/admin/import/ImportUpload";
import { ChevronLeftIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDayTime } from "@/lib/requests/format";
import { listImports } from "@/lib/staff-import/store";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Import existing staff" };

/** "38 people (5 leavers) · 412 access rows" — an earlier import's result. */
function result(i: Awaited<ReturnType<typeof listImports>>[number]) {
  if (i.status === "discarded")
    return "Discarded before Confirm · nothing imported";
  if (i.status === "open") return `${i.rows} people read · not imported yet`;
  const c = i.counts;
  const leavers = c.leavers
    ? ` (${c.leavers} leaver${c.leavers === 1 ? "" : "s"})`
    : "";
  return `${c.people ?? 0} people${leavers} · ${c.access ?? 0} access rows`;
}

/** Admin → Import existing staff (F24c, board *Phone · Admin · Import existing staff*). */
export default async function AdminImportPage() {
  await requireRole("admin");
  const [imports, timeZone] = await Promise.all([
    listImports(createServerSupabaseClient()),
    displayTimezone(),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[32px] leading-tight">
          Import existing staff
        </h1>
        <p className="text-sm leading-normal text-graphite">
          Bring people who joined{" "}
          <em className="font-accent text-[15px]">before this app</em> into it —
          with their real start and leave dates and the access they hold.
        </p>
      </div>

      <ImportUpload />

      <div className="flex flex-col gap-1.5 rounded-card bg-ink px-3.5 py-3 text-paper">
        <strong className="text-sm">The only place for past dates</strong>
        <span className="text-[13px] leading-normal text-sand">
          Everywhere else the app sets dates itself. Here they come from your
          file — every imported record says where it came from, the import is
          audited with today’s time, and nothing imported is ever shown as
          signed in the app.
        </span>
      </div>

      <section
        aria-labelledby="earlier-imports"
        className="flex flex-col gap-2"
      >
        <h2 id="earlier-imports" className="font-serif text-[21px]">
          Earlier imports
        </h2>
        {imports.length === 0 ? (
          <p className="text-[13px] text-graphite">No imports yet.</p>
        ) : (
          <ul className="rounded-card border border-line bg-paper">
            {imports.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-2.5 border-b border-line-subtle px-3.5 py-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="text-sm break-words">{i.fileName}</strong>
                  <span className="text-xs text-graphite">
                    {formatDayTime(i.finishedAt ?? i.createdAt, timeZone)}
                    {i.createdBy ? ` · ${i.createdBy}` : ""} · {result(i)}
                  </span>
                </span>
                {i.status === "discarded" ? (
                  <span className="rounded-pill border border-field-border px-2.5 py-0.5 text-[11px] font-semibold text-graphite">
                    Discarded
                  </span>
                ) : (
                  <Link
                    href={`/admin/import/${i.id}`}
                    className="text-[13px] font-semibold underline"
                  >
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
