"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  readBatchPaste,
  readBatchUpload,
} from "@/app/(app)/requests/batch/actions";
import { Button, InlineError } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A plain link: <Link> would prefetch a download. */
const TEMPLATE = "/requests/batch/template";

type Kind = "onboarding" | "offboarding" | "access_modification";

const KINDS: { value: Kind; title: string; note: string; ready: boolean }[] = [
  {
    value: "onboarding",
    title: "Onboarding",
    note: "New joiners",
    ready: true,
  },
  {
    value: "offboarding",
    title: "Offboarding",
    note: "Leavers — found among the people who hold access today",
    ready: true,
  },
  {
    value: "access_modification",
    title: "Access change",
    note: "Role changes — coming next",
    ready: false,
  },
];

/** What the list should hold, per kind (the template's own columns). */
const HINTS: Record<"onboarding" | "offboarding", string> = {
  onboarding:
    "One column per application, titled with its name: write the role (or Yes for its usual role), leave it empty when not needed. Your own columns are fine too: they are matched by name (First name, Email, Department, Office, Start date …).",
  offboarding:
    "One row per leaver: name or work email, and the last working day. SLA, cut-off time, handover, removal method and mailbox can stay empty — set them once for everyone on the next page; a row's own cell wins.",
};

/**
 * New batch (board *Phone · New batch*): the kind, then a file or a pasted
 * list → Read the list → the batch page. Nothing is created here.
 */
export function NewBatchForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("onboarding");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leavers = kind === "offboarding";

  async function read() {
    setError(null);
    if (mode === "file" && !file)
      return setError("Choose a .xlsx or .csv file.");
    if (mode === "paste" && !text.trim())
      return setError("Paste a list first.");
    setBusy(true);
    let result;
    if (mode === "file" && file) {
      const form = new FormData();
      form.set("type", kind);
      form.set("file", file);
      result = await readBatchUpload(form);
    } else {
      result = await readBatchPaste(kind, text);
    }
    if (result.ok) {
      router.push(`/requests/batch/${result.id}`);
      return;
    }
    setBusy(false);
    setError(result.message);
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-[13px] font-semibold">
          1 · What kind of requests?
        </legend>
        {KINDS.map((k) => (
          <label
            key={k.value}
            className={cn(
              "bg-white flex items-center gap-3 rounded-card px-3.5 py-3",
              kind === k.value
                ? "border-2 border-ink"
                : "border border-field-border",
              !k.ready && "opacity-60",
            )}
          >
            <input
              type="radio"
              name="kind"
              value={k.value}
              checked={kind === k.value}
              disabled={!k.ready}
              onChange={() => setKind(k.value)}
              className="size-4.5 accent-ink"
            />
            <span className="flex flex-col">
              <strong className="text-[15px] md:text-sm">{k.title}</strong>
              <span className="text-xs text-graphite">{k.note}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold">2 · Your list</span>
        <div role="tablist" aria-label="Your list" className="flex gap-1.5">
          {(
            [
              ["file", "Upload a file"],
              ["paste", "Paste a list"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "h-9 rounded-pill px-3.5 text-[13px] font-semibold",
                mode === value
                  ? "text-white bg-ink"
                  : "border border-field-border",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "file" ? (
          <label className="bg-white flex cursor-pointer flex-col items-center gap-2 rounded-card border-[1.5px] border-dashed border-ink px-4 py-5 text-center">
            <span className="text-sm">
              {file ? (
                <>
                  <strong>{file.name}</strong> ·{" "}
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </>
              ) : (
                <>
                  Choose a <strong>.xlsx</strong> or <strong>.csv</strong> file
                </>
              )}
            </span>
            <input
              type="file"
              aria-label="List file (.xlsx or .csv)"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[13px] file:mr-3 file:h-10 file:rounded-pill file:border file:border-ink file:bg-transparent file:px-4 file:font-semibold"
            />
            <span className="text-xs text-graphite">
              Up to 50 people · 1 MB · the first sheet
            </span>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Pasted list
            <textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                leavers
                  ? "Name or work email\tLast working day\t…\narjun.mehta@laine.ai\t30/11/2026\t…"
                  : "First name\tLast name\tWork email\t…\nMeera\tNair\tmeera.nair@laine.ai\t…"
              }
              className="bg-white rounded-field border border-field-border px-3 py-2.5 text-base leading-snug font-normal outline-none focus:border-ink md:text-sm"
            />
            <span className="text-xs font-normal text-graphite">
              Copy the cells from Excel, with the title row. A list without
              titles can go to the Laine assistant.
            </span>
          </label>
        )}
        <a
          href={leavers ? `${TEMPLATE}?kind=offboarding` : TEMPLATE}
          download
          className="self-start text-[13px] font-semibold underline"
        >
          Download the {leavers ? "offboarding" : "onboarding"} template (.xlsx)
        </a>
        <span className="text-xs leading-normal text-graphite">
          {HINTS[leavers ? "offboarding" : "onboarding"]}
        </span>
      </div>

      {error && <InlineError>{error}</InlineError>}
      <Button size="lg" loading={busy} onClick={() => void read()}>
        Read the list
      </Button>
      <p className="text-center text-xs text-graphite">
        Nothing is created until you check the list and press Confirm. Batches
        are kept 7 days.
      </p>
    </div>
  );
}
