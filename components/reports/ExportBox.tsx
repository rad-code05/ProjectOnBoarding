import { DownloadIcon, buttonStyles } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Export buttons under a report (CSV and PDF; Excel for custom reports). Plain links (never
 * prefetched): every export is a real click, and each is written to the
 * audit log.
 */
export function ExportBox({
  href,
  note,
  excel = false,
}: {
  /** The report's export URL with its filters; `format=pdf` is added for PDF. */
  href: string;
  note: string;
  /** Also an Excel button (`format=xlsx`; custom reports, F17a-5). */
  excel?: boolean;
}) {
  const join = href.includes("?") ? "&" : "?";
  const pdfHref = `${href}${join}format=pdf`;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-paper p-3.5">
      <div
        className={cn(
          "grid gap-2 md:flex",
          excel ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <a href={href} download className={buttonStyles("secondary", "md")}>
          <DownloadIcon size={16} />
          {excel ? "CSV" : "Export CSV"}
        </a>
        <a href={pdfHref} download className={buttonStyles("secondary", "md")}>
          <DownloadIcon size={16} />
          {excel ? "PDF" : "Export PDF"}
        </a>
        {excel && (
          <a
            href={`${href}${join}format=xlsx`}
            download
            className={buttonStyles("secondary", "md")}
          >
            <DownloadIcon size={16} />
            Excel
          </a>
        )}
      </div>
      <p className="text-xs leading-normal text-graphite">{note}</p>
    </div>
  );
}
