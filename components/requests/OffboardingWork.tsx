"use client";

import { useRouter } from "next/navigation";
import {
  useId,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  setEquipmentReturn,
  setMailboxHandling,
  setRemoval,
} from "@/app/(app)/requests/actions";
import {
  Button,
  ChevronRightIcon,
  InlineError,
  Sheet,
  sheetPill,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AccessResult } from "@/lib/requests/access";
import { formatDay, formatTime } from "@/lib/requests/format";
import {
  MAILBOX_LABELS,
  REMOVAL_METHODS,
  RETURN_LABELS,
  type MailboxHandling,
  type Removals,
  type ReturnStatus,
} from "@/lib/requests/offboarding";
import { AddRemoval, TakeOff, type RemovalEdit } from "./RemovalEditor";
import { SectionFlag, sectionFrame } from "./ReturnedCard";

/**
 * Runs one recorded step, then reloads the page data (times come from the
 * server). `show` applies the change on screen at once (useOptimistic); React
 * undoes it by itself if the step is refused.
 */
function useWork() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (
    step: () => Promise<AccessResult>,
    onDone?: () => void,
    show?: () => void,
  ) =>
    start(async () => {
      setError(null);
      show?.();
      const result = await step();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone?.();
      router.refresh();
    });
  return { error, pending, run };
}

function when(iso: string, timeZone: string): string {
  return `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}`;
}

function WorkSection({
  number,
  title,
  status,
  flag,
  error,
  hint,
  footer,
  children,
}: {
  number: number;
  title: string;
  status: string;
  flag?: string | null;
  error: string | null;
  hint?: string;
  /** "Add …" while the offboarding can be changed (F09d-4). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`s${number}`}
      aria-labelledby={`s${number}-title`}
      className={cn(
        "flex flex-col gap-2 rounded-card bg-paper pt-4 pb-2 md:col-span-2",
        sectionFrame(flag),
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2.5 px-4 md:px-5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          {String(number).padStart(2, "0")}
        </span>
        <h2
          id={`s${number}-title`}
          className="font-serif text-[21px] md:text-[19px]"
        >
          {title}
        </h2>
        <SectionFlag label={flag} />
        <span
          role="status"
          className="ml-auto text-xs font-semibold whitespace-nowrap text-graphite md:text-[11px]"
        >
          {status}
        </span>
      </div>
      {hint && (
        <p className="px-4 text-xs leading-normal text-graphite md:px-5">
          {hint}
        </p>
      )}
      {error && (
        <div className="px-4 md:px-5">
          <InlineError live>{error}</InlineError>
        </div>
      )}
      <ul className="border-t border-line-subtle">{children}</ul>
      {footer}
    </section>
  );
}

function Tick({
  label,
  checked,
  disabled,
  onChange,
  doneAt,
  timeZone,
  detail,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (done: boolean) => void;
  doneAt: string | null;
  timeZone: string;
  detail: string;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-6 shrink-0 accent-ink md:size-4.5"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold md:text-[13px]">{label}</span>
        {detail && (
          <span className="truncate text-[13px] text-graphite md:text-xs">
            {detail}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-[13px] whitespace-nowrap md:text-xs",
          doneAt ? "font-semibold" : "text-graphite",
        )}
      >
        {doneAt ? `Removed ${formatTime(doneAt, timeZone)}` : "Not yet"}
      </span>
    </label>
  );
}

/**
 * Sections 5–7 while an offboarding is in execution (board Phone ·
 * Offboarding in execution): choose Delete / Suspend / Disable and tick each
 * application, tick each access, settle each device. `editable` false = after
 * Review & sign: the same rows, read only.
 */
export function WorkRemovalSections({
  removals,
  editable,
  timeZone,
  flag,
  edit,
}: {
  removals: Removals;
  editable: boolean;
  timeZone: string;
  flag: (section: number) => string | null;
  /** Add / take off rows (F09d-4); only while editable. */
  edit?: RemovalEdit;
}) {
  const changes = editable ? edit : undefined;
  const apps = useWork();
  const access = useWork();
  // What the screen shows: the server's rows plus changes still being saved.
  const [shown, patch] = useOptimistic(
    removals,
    (
      current: Removals,
      change: {
        id: string;
        done?: boolean;
        method?: Removals["apps"][number]["method"];
      },
    ): Removals => {
      const tick = (doneAt: string | null) =>
        change.done === undefined
          ? doneAt
          : change.done
            ? (doneAt ?? new Date().toISOString())
            : null;
      return {
        ...current,
        apps: current.apps.map((a) =>
          a.id === change.id
            ? {
                ...a,
                doneAt: tick(a.doneAt),
                method: change.method ?? a.method,
              }
            : a,
        ),
        access: current.access.map((a) =>
          a.id === change.id ? { ...a, doneAt: tick(a.doneAt) } : a,
        ),
      };
    },
  );
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const appsDone = shown.apps.filter((a) => a.doneAt).length;
  const accessDone = shown.access.filter((a) => a.doneAt).length;
  const kitSettled = removals.equipment.filter(
    (e) => e.status !== "pending",
  ).length;
  const device = removals.equipment.find((e) => e.id === sheetFor) ?? null;

  return (
    <>
      <WorkSection
        number={5}
        title="Applications to remove"
        status={`${appsDone} of ${shown.apps.length}`}
        flag={flag(5)}
        error={apps.error}
        hint={
          editable
            ? "Choose how it was removed — Delete, Suspend or Disable — then tick it. The time is recorded by the system."
            : undefined
        }
        footer={
          changes && (
            <AddRemoval edit={changes} kind="app" removals={removals} />
          )
        }
      >
        {shown.apps.map((app) => (
          <li
            key={app.id}
            className="flex flex-col gap-2 border-b border-line-subtle px-4 py-2.5 last:border-b-0 md:px-5"
          >
            <Tick
              label={app.name}
              detail={app.had ? `Had: ${app.had}` : app.category}
              checked={Boolean(app.doneAt)}
              disabled={!editable || apps.pending || !app.method}
              doneAt={app.doneAt}
              timeZone={timeZone}
              onChange={(done) =>
                apps.run(
                  () =>
                    setRemoval({
                      kind: "application",
                      itemId: app.id,
                      done,
                      method: null,
                    }),
                  undefined,
                  () => patch({ id: app.id, done }),
                )
              }
            />
            <fieldset
              disabled={!editable || apps.pending || Boolean(app.doneAt)}
              className="ml-9 md:ml-7.5"
            >
              <legend className="sr-only">How {app.name} is removed</legend>
              <div className="grid grid-cols-3 gap-0.75 rounded-pill bg-sand p-0.75 md:max-w-xs">
                {REMOVAL_METHODS.map((method) => (
                  <label
                    key={method}
                    className="flex h-9.5 cursor-pointer items-center justify-center rounded-pill text-[13px] font-medium has-checked:bg-ink has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink has-disabled:cursor-default md:h-7.5 md:text-xs"
                  >
                    <input
                      type="radio"
                      name={`method-${app.id}`}
                      value={method}
                      checked={app.method === method}
                      onChange={() =>
                        apps.run(
                          () =>
                            setRemoval({
                              kind: "application",
                              itemId: app.id,
                              done: null,
                              method,
                            }),
                          undefined,
                          () => patch({ id: app.id, method }),
                        )
                      }
                      className="sr-only"
                    />
                    {method}
                  </label>
                ))}
              </div>
            </fieldset>
            {changes && !app.doneAt && (
              <div className="-mt-1 ml-9 flex md:ml-7.5">
                <TakeOff edit={changes} kind="app" row={app} />
              </div>
            )}
          </li>
        ))}
      </WorkSection>

      <WorkSection
        number={6}
        title="Equipment to return"
        status={`${kitSettled} of ${removals.equipment.length}`}
        flag={flag(6)}
        error={null}
        footer={
          changes && (
            <AddRemoval edit={changes} kind="equipment" removals={removals} />
          )
        }
      >
        {removals.equipment.map((item) => (
          <li
            key={item.id}
            className="border-b border-line-subtle last:border-b-0"
          >
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={!editable}
              onClick={() => setSheetFor(item.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left disabled:cursor-default md:min-h-12 md:px-5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold md:text-[13px]">
                  {item.name}
                </span>
                <span className="truncate text-[13px] text-graphite md:text-xs">
                  {[
                    item.assetTag ? `Asset ${item.assetTag}` : null,
                    item.status === "not_returned" ? item.reason : null,
                    item.recordedAt ? when(item.recordedAt, timeZone) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-pill px-2.5 py-0.75 text-xs font-bold",
                  item.status === "pending"
                    ? "border border-ink"
                    : "bg-ink text-paper",
                )}
              >
                {RETURN_LABELS[item.status]}
              </span>
              {editable && (
                <ChevronRightIcon
                  size={16}
                  className="shrink-0 text-graphite"
                />
              )}
            </button>
            {changes && item.status === "pending" && (
              <div className="-mt-2 flex justify-end px-4 md:px-5">
                <TakeOff edit={changes} kind="equipment" row={item} />
              </div>
            )}
          </li>
        ))}
      </WorkSection>

      <WorkSection
        number={7}
        title="Physical & logical access"
        status={`${accessDone} of ${shown.access.length}`}
        flag={flag(7)}
        error={access.error}
        footer={
          changes && (
            <AddRemoval edit={changes} kind="access" removals={removals} />
          )
        }
      >
        {shown.access.map((row) => (
          <li
            key={row.id}
            className="border-b border-line-subtle px-4 py-1.5 last:border-b-0 md:px-5"
          >
            <Tick
              label={row.name}
              detail={[row.action, row.scope].filter(Boolean).join(" · ")}
              checked={Boolean(row.doneAt)}
              disabled={!editable || access.pending}
              doneAt={row.doneAt}
              timeZone={timeZone}
              onChange={(done) =>
                access.run(
                  () =>
                    setRemoval({
                      kind: "access",
                      itemId: row.id,
                      done,
                      method: null,
                    }),
                  undefined,
                  () => patch({ id: row.id, done }),
                )
              }
            />
            {changes && !row.doneAt && (
              <div className="-mt-1 ml-9 flex md:ml-7.5">
                <TakeOff edit={changes} kind="access" row={row} />
              </div>
            )}
          </li>
        ))}
      </WorkSection>

      {device && (
        <EquipmentReturnSheet item={device} onClose={() => setSheetFor(null)} />
      )}
    </>
  );
}

/** Board Phone · Equipment return (sheet). */
export function EquipmentReturnSheet({
  item,
  onClose,
}: {
  item: Removals["equipment"][number];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ReturnStatus>(item.status);
  const [reason, setReason] = useState(item.reason ?? "");
  const { error, pending, run } = useWork();
  const reasonId = useId();
  const needsReason = status === "not_returned" && !reason.trim();
  const help: Record<ReturnStatus, string> = {
    pending: "Still with the person or on its way.",
    received: "Back with IT. Date and time recorded now.",
    not_returned: "Lost, kept or written off — say why below.",
  };

  return (
    <Sheet
      eyebrow="06 · Equipment to return"
      title={item.name}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={needsReason}
            onClick={() =>
              run(
                () =>
                  setEquipmentReturn({
                    itemId: item.id,
                    status,
                    reason: status === "not_returned" ? reason : null,
                  }),
                onClose,
              )
            }
          >
            Save
          </Button>
        </div>
      }
    >
      {item.assetTag && (
        <p className="-mt-2 text-[13px] text-graphite">Asset {item.assetTag}</p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-semibold">Status</legend>
        {(Object.keys(RETURN_LABELS) as ReturnStatus[]).map((value) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3",
              status === value
                ? "border-2 border-ink"
                : "border border-field-border",
            )}
          >
            <input
              type="radio"
              name="return-status"
              value={value}
              checked={status === value}
              onChange={() => setStatus(value)}
              className="mt-0.5 size-5.5 shrink-0 accent-ink"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">
                {RETURN_LABELS[value]}
              </span>
              <span className="text-xs leading-snug text-graphite">
                {help[value]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {status === "not_returned" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-[13px] font-semibold">
            What happened? <span className="text-signal">*</span>
          </label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="resize-none rounded-field border border-field-border px-3 py-2.5 text-base leading-snug"
          />
          <span className="text-xs text-graphite">
            Required for “Not returned”. Shown on the record and the PDF.
          </span>
        </div>
      )}
      <p className="rounded-xl bg-sand px-3.5 py-3 text-xs leading-normal text-graphite">
        Equipment returns don&apos;t count towards the access removal SLA —
        shipping can take days.
      </p>
      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}

/** Handover, during execution: the required mailbox choice (recorded with its time). */
export function MailboxChoice({
  requestId,
  handling,
  recordedAt,
  editable,
  timeZone,
}: {
  requestId: string;
  handling: MailboxHandling | null;
  recordedAt: string | null;
  editable: boolean;
  timeZone: string;
}) {
  const { error, pending, run } = useWork();
  const [choice, setChoice] = useOptimistic(handling);
  return (
    <fieldset disabled={!editable || pending} className="flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-semibold">
        Mailbox <span className="text-signal">*</span>
      </legend>
      {(Object.keys(MAILBOX_LABELS) as MailboxHandling[]).map((value) => (
        <label
          key={value}
          className={sheetPill(
            choice === value,
            cn(
              "h-auto min-h-12 justify-start gap-3 rounded-xl px-3.5 py-2.5 text-left",
              choice === value
                ? "border-2 border-ink"
                : "border border-field-border",
            ),
          )}
        >
          <input
            type="radio"
            name="mailbox"
            value={value}
            checked={choice === value}
            onChange={() =>
              run(
                () => setMailboxHandling({ requestId, value }),
                undefined,
                () => setChoice(value),
              )
            }
            className="size-5 shrink-0 accent-ink"
          />
          <span className="flex flex-col gap-0.5">
            <span>{MAILBOX_LABELS[value]}</span>
            {choice === value && recordedAt && (
              <span className="text-xs font-medium text-graphite">
                Recorded {when(recordedAt, timeZone)}
              </span>
            )}
          </span>
        </label>
      ))}
      <span className="text-xs leading-normal text-graphite">
        Office 365: block sign-in and convert the mailbox to a shared mailbox
        for the person above.
      </span>
      {error && <InlineError live>{error}</InlineError>}
    </fieldset>
  );
}
