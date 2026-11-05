import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportGrid } from "@/components/admin/import/ImportGrid";
import { ChevronLeftIcon, DownloadIcon } from "@/components/ui";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import { requireRole } from "@/lib/auth";
import { formatDayTime } from "@/lib/requests/format";
import { loadImport, type StaffImport } from "@/lib/staff-import/store";
import { rowName } from "@/lib/staff-import/view";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Import" };

const BADGE: Record<StaffImport["status"], string> = {
  open: "Not imported yet",
  imported: "Imported",
  discarded: "Discarded",
};

/** One import (F24c): the check grid while open, the result once imported. */
export default async function ImportPage({
  params,
}: PageProps<"/admin/import/[id]">) {
  await requireRole("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createServerSupabaseClient();
  const [imp, options, timeZone] = await Promise.all([
    loadImport(db, id),
    loadFormOptions(db),
    displayTimezone(),
  ]);
  if (!imp) notFound();
  const accessRows = imp.rows.reduce((n, r) => n + r.person.access.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/import"
          className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold"
        >
          <ChevronLeftIcon size={18} />
          Import
        </Link>
        <span className="flex-1" />
        <span className="rounded-pill border border-ink px-2.5 py-0.5 text-[11px] font-semibold">
          {BADGE[imp.status]}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          {imp.status === "imported" ? "Import · done" : "Import · check"}
        </span>
        <h1 className="font-serif text-[30px] leading-tight break-words">
          {imp.status === "imported"
            ? `${imp.counts.people ?? 0} people imported`
            : imp.fileName}
        </h1>
        <span className="text-[13px] text-graphite">
          {imp.status === "imported"
            ? `${imp.fileName} · ${formatDayTime(imp.finishedAt ?? imp.createdAt, timeZone)}${imp.createdBy ? ` · by ${imp.createdBy}` : ""}`
            : `${imp.rows.length} people · ${accessRows} access rows · uploaded ${formatDayTime(imp.createdAt, timeZone)}`}
        </span>
      </div>

      {imp.status === "open" && (
        <ImportGrid
          importId={imp.id}
          rows={imp.rows.map((r) => ({
            id: r.id,
            position: r.position,
            included: r.included,
            values: r.data.values,
            other: r.data.other,
            problems: r.problems,
            skipped: r.data.skipped ?? null,
          }))}
          departments={options.departments.map((d) => d.name)}
          offices={options.offices.map((o) => o.name)}
        />
      )}

      {imp.status === "imported" && <Imported imp={imp} />}

      {imp.status === "discarded" && (
        <p className="rounded-card border border-line bg-paper px-3.5 py-3 text-sm leading-normal">
          This import was discarded before Confirm — nobody was imported.
        </p>
      )}
    </div>
  );
}

/** After Confirm (board *Confirm import + result*, lower half). */
function Imported({ imp }: { imp: StaffImport }) {
  const made = imp.rows.filter((r) => r.tickets.length);
  const leavers = imp.counts.leavers ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className="rounded-card bg-ink px-3.5 py-3 text-sm leading-normal text-paper"
      >
        {made.length - leavers} working here and {leavers} leaver
        {leavers === 1 ? "" : "s"} now count in every report.{" "}
        <strong>Their signed forms are still on SharePoint</strong> — attach
        them to the Imported records whenever you like.
      </div>
      <ul
        aria-label="Imported records"
        className="rounded-card border border-line-subtle bg-paper"
      >
        {made.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2.5 border-b border-line-subtle px-3.5 py-3 last:border-b-0"
          >
            <span className="flex flex-1 flex-col">
              <strong className="text-sm">
                {rowName({
                  position: r.position,
                  included: r.included,
                  values: r.data.values,
                  problems: r.problems,
                  skipped: null,
                })}
              </strong>
              <span className="text-xs text-graphite">
                {r.tickets.join(" · ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {imp.filePath && (
        <a
          href={`/admin/import/${imp.id}/file`}
          className="flex h-11 items-center gap-1.5 self-start rounded-pill border border-ink px-4.5 text-sm font-semibold"
        >
          <DownloadIcon size={16} />
          Download the import file
        </a>
      )}
    </div>
  );
}
