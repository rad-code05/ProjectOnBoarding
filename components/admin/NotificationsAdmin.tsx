"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  saveNotificationSettings,
  sendTestEmail,
} from "@/app/(app)/admin/actions";
import { Button, InlineError, Toast } from "@/components/ui";
import type { NotificationsView } from "@/lib/admin/notifications";
import {
  EMAIL_SWITCHES,
  switchWords,
  type RecentEmail,
} from "@/lib/admin/notifications-shared";
import { cn } from "@/lib/cn";

const FIRST = 10;

const STATUS_STYLE: Record<RecentEmail["status"], string> = {
  Sent: "border-ink text-ink",
  Waiting: "border-stone text-graphite",
  Skipped: "border-stone text-graphite",
  Failed: "border-signal text-signal",
};

/**
 * Admin → Notifications (F23c, board Phone · Admin · Notifications): the
 * sender's status + a test email, which emails are on, and the recent emails
 * with their status (sent / waiting / skipped / failed).
 */
export function NotificationsAdmin({ view }: { view: NotificationsView }) {
  const router = useRouter();
  const id = useId();
  const [switches, setSwitches] = useState(view.switches);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [all, setAll] = useState(false);
  const shown = all ? view.recent : view.recent.slice(0, FIRST);

  const save = () =>
    startSave(async () => {
      setError(null);
      const result = await saveNotificationSettings(switches);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setToast("Notifications saved.");
      router.refresh();
    });

  const test = () =>
    startTest(async () => {
      setError(null);
      const result = await sendTestEmail();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setToast("Test email queued — it shows under Recent emails.");
      router.refresh();
      // The sender runs just after the answer: show its result too.
      setTimeout(() => router.refresh(), 4000);
    });

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby={`${id}-sender`}
        className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
      >
        <div className="flex flex-col gap-0.5">
          <h2 id={`${id}-sender`} className="font-serif text-[21px]">
            Sender
          </h2>
          <span className="text-[13px] break-all text-graphite">
            {view.sender}
          </span>
        </div>
        <div
          role="group"
          aria-label="Sender status"
          className={cn(
            "flex flex-col gap-0.5 rounded-xl px-3.5 py-3",
            view.status.connected ? "bg-ink text-paper" : "bg-sand",
          )}
        >
          <span className="text-[15px] font-bold">{view.status.headline}</span>
          <span
            className={cn(
              "text-[13px]",
              view.status.connected ? "text-stone" : "text-graphite",
            )}
          >
            {view.status.line}
          </span>
        </div>
        <p className="text-[13px] leading-normal text-graphite">
          Real sending starts when the domain&apos;s DNS records are added
          (Laine IT) and the Resend key is saved on the server. Test and preview
          sites only ever email the test accounts.
        </p>
        <Button
          variant="secondary"
          loading={testing}
          onClick={test}
          className="self-start"
        >
          Send a test email to me
        </Button>
      </section>

      <section
        aria-labelledby={`${id}-which`}
        className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
      >
        <h2 id={`${id}-which`} className="font-serif text-[21px]">
          Which emails
        </h2>
        <ul className="flex flex-col">
          {EMAIL_SWITCHES.map((kind) => {
            const words = switchWords(kind, view);
            const on = switches[kind];
            return (
              <li
                key={kind}
                className="border-b border-line-subtle py-2.5 last:border-b-0"
              >
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">
                      {words.name}
                    </span>
                    <span className="text-[13px] leading-snug text-graphite">
                      {words.when}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={on}
                    onChange={(e) =>
                      setSwitches((s) => ({ ...s, [kind]: e.target.checked }))
                    }
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-pill transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                      on ? "bg-ink" : "bg-stone",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 size-5 rounded-pill bg-paper transition-[left]",
                        on ? "left-6" : "left-1",
                      )}
                    />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-[13px] leading-normal text-graphite">
          Reminders: once a day after{" "}
          {view.reminderAfterDays === 1
            ? "1 day"
            : `${view.reminderAfterDays} days`}{" "}
          of waiting (company time), until someone confirms or returns it.
          Switching an email off stops new ones; nothing already sent changes.
        </p>
        {error && <InlineError live>{error}</InlineError>}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="text-xs text-graphite">
            {view.lastChanged
              ? `Last changed by ${view.lastChanged}`
              : "Not changed since the start"}
          </span>
          <Button loading={saving} onClick={save} className="md:self-end">
            Save
          </Button>
        </div>
      </section>

      <section
        aria-labelledby={`${id}-recent`}
        className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id={`${id}-recent`} className="font-serif text-[21px]">
            Recent emails
          </h2>
          <span className="text-xs text-graphite">last 30 days</span>
        </div>
        {view.recent.length === 0 ? (
          <p className="text-[13px] text-graphite">
            No emails in the last 30 days.
          </p>
        ) : (
          <ul className="flex flex-col">
            {shown.map((m) => (
              <li
                key={m.key}
                className="flex flex-col gap-1 border-b border-line-subtle py-2.5 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold break-words">
                    {m.subject}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold",
                      STATUS_STYLE[m.status],
                    )}
                  >
                    {m.status}
                  </span>
                </div>
                <span className="text-xs text-graphite">
                  To {m.to} · {m.when}
                </span>
                {m.note && (
                  <span
                    className={cn(
                      "text-xs break-words",
                      m.status === "Failed" ? "text-signal" : "text-graphite",
                    )}
                  >
                    {m.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!all && view.recent.length > FIRST && (
          <Button
            variant="text"
            onClick={() => setAll(true)}
            className="self-start"
          >
            Show more ({view.recent.length - FIRST})
          </Button>
        )}
        <p className="text-xs leading-normal text-graphite">
          A failed email is tried again 3 times, then shown as Failed with the
          reason. Every email is also in the audit log.
        </p>
      </section>

      {toast && <Toast onClose={() => setToast(null)}>{toast}</Toast>}
    </div>
  );
}
