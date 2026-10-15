import { DownloadIcon, buttonStyles } from "@/components/ui";

/**
 * Export buttons under a report. Plain links (never prefetched): every
 * export is a real click, and each is written to the audit log.
 */
export function ExportBox({
  csvHref,
  note,
}: {
  csvHref: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3.5">
      <a
        href={csvHref}
        download
        className={`${buttonStyles("secondary", "md")} w-full md:w-auto md:self-start`}
      >
        <DownloadIcon size={16} />
        Export CSV
      </a>
      <p className="text-xs leading-normal text-graphite">{note}</p>
    </div>
  );
}
