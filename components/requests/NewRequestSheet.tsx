"use client";

import { useId, useState, useTransition } from "react";
import { createDraft, startOffboarding } from "@/app/(app)/requests/actions";
import { Button, InlineError, PlusIcon, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  filterLeavers,
  leaverNote,
  type Leaver,
} from "@/lib/requests/leavers-shared";

type Kind = "onboarding" | "offboarding";

/**
 * "New request" (F09c, board Phone · Start an offboarding): choose the type;
 * an offboarding starts from "Who is leaving?" — people with access on
 * record, pre-filled by the database — or empty for someone not in the app.
 */
export function NewRequestMenu({
  leavers,
  className,
}: {
  leavers: Leaver[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        aria-haspopup="dialog"
        iconLeft={<PlusIcon />}
        fullWidth
        className={className}
        onClick={() => setOpen(true)}
      >
        New request
      </Button>
      {open && (
        <NewRequestSheet leavers={leavers} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function NewRequestSheet({
  leavers,
  onClose,
}: {
  leavers: Leaver[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>("onboarding");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const searchId = useId();
  const shown = filterLeavers(leavers, query);
  const person = leavers.find((l) => l.id === chosen) ?? null;

  const go = (action: () => Promise<{ ok: false; message: string } | void>) =>
    start(async () => {
      setError(null);
      // On success the action redirects to the new draft.
      const result = await action();
      if (result && !result.ok) setError(result.message);
    });

  return (
    <Sheet
      eyebrow="New request"
      title={kind === "offboarding" ? "Who is leaving?" : "New onboarding"}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {kind === "onboarding" ? (
            <Button loading={pending} onClick={() => go(() => createDraft())}>
              Start onboarding
            </Button>
          ) : (
            <Button
              loading={pending}
              disabled={!person}
              onClick={() =>
                person && go(() => startOffboarding({ employeeId: person.id }))
              }
            >
              {person ? `Offboard ${person.name.split(" ")[0]}` : "Offboard"}
            </Button>
          )}
        </div>
      }
    >
      <fieldset className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <legend className="sr-only">Request type</legend>
        <div className="inline-flex gap-0.75 rounded-pill bg-sand p-0.75 whitespace-nowrap">
          {(
            [
              ["onboarding", "Onboarding"],
              ["offboarding", "Offboarding"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex h-9.5 cursor-pointer items-center rounded-pill px-3.5 text-[13px] font-medium has-checked:bg-ink has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
            >
              <input
                type="radio"
                name="request-kind"
                value={value}
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setError(null);
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
          <span
            aria-disabled="true"
            className="flex h-9.5 items-center rounded-pill px-3.5 text-[13px] text-graphite"
          >
            Access change · soon
          </span>
        </div>
      </fieldset>

      {kind === "onboarding" ? (
        <p className="text-[15px] leading-normal">
          A new person joins: you fill in their details, applications and
          equipment. It&apos;s saved as a draft you can come back to.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={searchId} className="text-[13px] font-semibold">
              Find the person
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or work email"
              className="h-12 rounded-field border border-field-border px-3 text-base"
            />
            <span className="text-xs leading-normal text-graphite">
              People with access on record — everything granted on their closed
              requests.
            </span>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Person</legend>
            {shown.length === 0 && (
              <p className="rounded-field bg-sand px-3 py-2.5 text-sm text-graphite">
                {leavers.length === 0
                  ? "Nobody has access on record yet — it fills as requests close."
                  : "Nobody matches that search."}
              </p>
            )}
            {shown.map((leaver) => {
              const blocked = Boolean(leaver.openTicket);
              return (
                <label
                  key={leaver.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl px-3.5 py-3",
                    chosen === leaver.id
                      ? "border-2 border-ink"
                      : "border border-line",
                    blocked ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <input
                    type="radio"
                    name="leaver"
                    value={leaver.id}
                    checked={chosen === leaver.id}
                    disabled={blocked}
                    onChange={() => setChosen(leaver.id)}
                    className="mt-0.5 size-5.5 shrink-0 accent-ink"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-[15px] font-bold",
                        blocked && "text-graphite",
                      )}
                    >
                      {leaver.name}
                    </span>
                    <span className="truncate text-[13px] text-graphite">
                      {[leaver.detail, leaver.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        blocked ? "text-signal" : "text-graphite",
                      )}
                    >
                      {leaverNote(leaver)}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="flex flex-col gap-1.5 rounded-xl bg-sand px-3.5 py-3">
            <span className="text-[13px] font-bold">Not in the list?</span>
            <span className="text-xs leading-normal text-graphite">
              People who joined before the app are added with the Excel import
              later. Until then you can start an empty offboarding and add what
              they have by hand.
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => go(() => startOffboarding({ employeeId: null }))}
              className="h-11 self-start text-sm font-semibold underline underline-offset-[3px]"
            >
              Start an empty offboarding
            </button>
          </div>
        </>
      )}
      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
