import { DownloadIcon, buttonStyles } from "@/components/ui";

/**
 * Export buttons under a report (CSV and PDF). Plain links (never
 * prefetched): every export is a real click, and each is written to the
 * audit log.
 */
export function ExportBox({
  href,
  note,
}: {
  /** The report's export URL with its filters; `format=pdf` is added for PDF. */
  href: string;
  note: string;
}) {
  const pdfHref = `${href}${href.includes("?") ? "&" : "?"}format=pdf`;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3.5">
      <div className="grid grid-cols-2 gap-2 md:flex">
        <a href={href} download className={buttonStyles("secondary", "md")}>
          <DownloadIcon size={16} />
          Export CSV
        </a>
        <a href={pdfHref} download className={buttonStyles("secondary", "md")}>
          <DownloadIcon size={16} />
          Export PDF
        </a>
      </div>
      <p className="text-xs leading-normal text-graphite">{note}</p>
    </div>
  );
}
