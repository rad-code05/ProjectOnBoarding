"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadImport } from "@/app/(app)/admin/import/actions";
import { Button, DownloadIcon, InlineError } from "@/components/ui";

/** A plain link: <Link> would prefetch a download. */
const TEMPLATE = "/admin/import/template";

/**
 * Admin → Import (F24c, board *Phone · Admin · Import existing staff*): the
 * upload card. The file is read on the server into an open import — kept as
 * evidence — and the check grid opens.
 */
export function ImportUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    if (!file) {
      setError("Choose the import file (.xlsx or .csv).");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const r = await uploadImport(form);
    if (r.ok) router.push(`/admin/import/${r.id}`);
    else {
      setBusy(false);
      setError(r.message);
    }
  }

  return (
    <section
      aria-labelledby="import-upload"
      className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
    >
      <h2 id="import-upload" className="font-serif text-[21px]">
        Upload the import file
      </h2>
      <label className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-dashed border-field-border p-4 text-[13px] font-semibold">
        <span>
          Choose a <strong>.xlsx</strong> or <strong>.csv</strong> file
        </span>
        <input
          type="file"
          aria-label="Import file (.xlsx or .csv)"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px] file:mr-3 file:h-10 file:rounded-pill file:border file:border-ink file:bg-transparent file:px-4 file:font-semibold"
        />
        <span className="text-xs font-normal text-graphite">
          Up to 500 people · 1 MB · the first sheet
        </span>
      </label>
      {error && <InlineError live>{error}</InlineError>}
      <Button loading={busy} onClick={read} className="self-start">
        Read the file
      </Button>
      <a
        href={TEMPLATE}
        download
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold underline"
      >
        <DownloadIcon size={16} />
        Download the import template
      </a>
      <p className="text-xs leading-normal text-graphite">
        One row per person: name, work email, job, department, office (+ state,
        city), nationality, manager,{" "}
        <strong className="text-ink">start date</strong>,{" "}
        <strong className="text-ink">leave date</strong> (leavers), other
        applications, then one column per application with the role.
      </p>
    </section>
  );
}
