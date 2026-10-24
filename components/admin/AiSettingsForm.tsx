"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { saveAiSettings } from "@/app/(app)/admin/actions";
import { Button, InlineError, Toast } from "@/components/ui";
import {
  usageCount,
  usageLine,
  type AiSettingsView,
} from "@/lib/admin/ai-shared";
import { cn } from "@/lib/cn";
import { AiModels } from "./AiModels";

/**
 * Admin → AI settings (F15e-1, board Phone · Admin · AI settings): the
 * assistant on / off for everyone, the model that answers, the monthly
 * budget and questions per person per hour, and what was used this month.
 * The models themselves (add, edit, retire, restore) are listed under the
 * choice — AiModels (F15e-2).
 */
export function AiSettingsForm({ view }: { view: AiSettingsView }) {
  const router = useRouter();
  const id = useId();
  const [enabled, setEnabled] = useState(view.enabled);
  const [model, setModel] = useState(view.model);
  const [budget, setBudget] = useState(String(view.budget));
  const [hourly, setHourly] = useState(String(view.hourly));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, start] = useTransition();
  const active = view.models.filter((m) => m.active);
  const share =
    view.budget > 0
      ? Math.min(100, Math.round((view.usage.spent / view.budget) * 100))
      : 100;

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await saveAiSettings({
        enabled,
        model,
        budget: Number(budget),
        hourly: Number(hourly),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby={`${id}-on`}
        className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
      >
        <h2 id={`${id}-on`} className="font-serif text-[21px]">
          Assistant
        </h2>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">
            {enabled ? "On for everyone" : "Off for everyone"}
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-pill transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
              enabled ? "bg-ink" : "bg-stone",
            )}
          >
            <span
              className={cn(
                "absolute top-1 size-5 rounded-pill bg-paper transition-[left]",
                enabled ? "left-6" : "left-1",
              )}
            />
          </span>
        </label>
        <p className="text-[13px] leading-normal text-graphite">
          Off = the robot is hidden for everyone; nothing is sent to Anthropic.
          Approvers only get report questions; the IT side gets every tool their
          roles allow.
        </p>
      </section>

      <section
        aria-labelledby={`${id}-model`}
        className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
      >
        <h2 id={`${id}-model`} className="font-serif text-[21px]">
          Model
        </h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">The model that answers</legend>
          {active.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3",
                model === m.id ? "border-2 border-ink" : "border-line",
              )}
            >
              <input
                type="radio"
                name={`${id}-model`}
                value={m.id}
                checked={model === m.id}
                onChange={() => setModel(m.id)}
                className="mt-1 size-4 accent-ink"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{m.name}</span>
                {m.note && (
                  <span className="text-[13px] leading-snug text-graphite">
                    {m.note}
                  </span>
                )}
                <span className="text-xs text-graphite">
                  ${m.priceIn} in · ${m.priceOut} out per 1M tokens
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <AiModels models={view.models} inUse={view.model} />
      </section>

      <section
        aria-labelledby={`${id}-limits`}
        className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4"
      >
        <h2 id={`${id}-limits`} className="font-serif text-[21px]">
          Limits
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">
              Monthly budget (USD)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={100000}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="h-12 rounded-field border border-field-border bg-paper px-3 text-base md:h-10 md:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">
              Questions per person / hour
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              step={1}
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
              className="h-12 rounded-field border border-field-border bg-paper px-3 text-base md:h-10 md:text-sm"
            />
          </label>
        </div>
        <div
          role="group"
          aria-label="Used this month"
          className="flex flex-col gap-1.5 rounded-xl bg-sand px-3.5 py-3"
        >
          <span className="text-xs font-semibold text-graphite">
            Used this month
          </span>
          <span className="text-[15px] font-bold">
            {usageLine(view.usage.spent, view.budget)}
          </span>
          <span
            aria-hidden="true"
            className="h-1.5 overflow-hidden rounded-pill bg-paper"
          >
            <span
              className={cn(
                "block h-full rounded-pill",
                share >= 100 ? "bg-signal" : "bg-ink",
              )}
              style={{ width: `${share}%` }}
            />
          </span>
          <span className="text-xs text-graphite">
            {usageCount(view.usage.answers, view.usage.people)} · resets{" "}
            {view.resetsOn}
          </span>
        </div>
      </section>

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
      <p className="text-xs leading-normal text-graphite">
        Every change here is recorded in the audit log. The API key stays in the
        server settings, never on this page.
      </p>
      {saved && (
        <Toast onClose={() => setSaved(false)}>AI settings saved.</Toast>
      )}
    </div>
  );
}
