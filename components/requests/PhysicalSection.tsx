"use client";

import {
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { clearPhysical, setPhysical } from "@/app/(app)/requests/actions";
import { ChevronRightIcon, InlineError } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  PhysicalChoice,
  PhysicalChoices,
  PhysicalType,
} from "@/lib/requests/equipment";
import { AppDialog } from "./AppDialog";

function label(choice: PhysicalChoice | undefined): string {
  if (!choice) return "Not set";
  return [choice.action, choice.scope].filter(Boolean).join(" · ");
}

/**
 * Section 7 — Physical & logical access: one row per type (office, VPN,
 * shared drives); a row opens the same sheet as applications, with "Scope".
 */
export function PhysicalSection({
  requestId,
  types,
  choices,
  onChoicesChange,
  disabled,
}: {
  requestId: string;
  types: PhysicalType[];
  choices: PhysicalChoices;
  onChoicesChange: Dispatch<SetStateAction<PhysicalChoices>>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<PhysicalType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const setCount = types.filter((type) => choices[type.id]).length;

  /** Show the change at once; undo it if the server refuses. */
  const apply = (typeId: number, choice: PhysicalChoice | null) => {
    const before = choices[typeId];
    const put = (value: PhysicalChoice | undefined) =>
      onChoicesChange((current) => {
        const next = { ...current };
        if (value) next[typeId] = value;
        else delete next[typeId];
        return next;
      });
    put(choice ?? undefined);
    startSaving(async () => {
      const result = choice
        ? await setPhysical({ requestId, typeId, ...choice })
        : await clearPhysical({ requestId, typeId });
      if (result.ok) {
        setError(null);
      } else {
        setError(result.message);
        put(before);
      }
    });
  };

  return (
    <section
      id="s7"
      aria-labelledby="s7-title"
      className="flex scroll-mt-28 flex-col gap-1.5 rounded-card border border-line bg-paper pt-4 pb-2 md:col-span-2 md:scroll-mt-6 md:px-1"
    >
      <div className="flex items-baseline gap-2.5 px-4 pb-1.5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          07
        </span>
        <h2 id="s7-title" className="font-serif text-[21px] md:text-[19px]">
          Physical &amp; logical access
        </h2>
        <span
          role="status"
          className="ml-auto text-xs font-semibold whitespace-nowrap text-graphite md:text-[11px]"
        >
          {saving ? "Saving…" : `${setCount} of ${types.length} set`}
        </span>
      </div>

      {error && (
        <InlineError live className="px-4">
          {error}
        </InlineError>
      )}

      <ul className="border-t border-line-subtle md:grid md:grid-cols-3 md:gap-2 md:border-0 md:px-3">
        {types.map((type) => {
          const choice = choices[type.id];
          return (
            <li key={type.id}>
              <button
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-label={`${type.name}: ${choice ? label(choice) : "not set"}. Change`}
                onClick={() => setEditing(type)}
                className={cn(
                  "flex min-h-13 w-full items-center gap-2.5 px-4 py-1.5 text-left md:min-h-11 md:rounded-[8px] md:border-[1.5px] md:px-3",
                  choice ? "md:border-line" : "md:border-transparent",
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-pill",
                    choice ? "bg-ink" : "border-[1.5px] border-field-border",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[15px] md:text-[13px]",
                    choice ? "font-bold" : "font-medium",
                  )}
                >
                  {type.name}
                </span>
                <span
                  className={cn(
                    "text-[13px] whitespace-nowrap md:text-xs",
                    choice ? "font-bold" : "text-graphite",
                  )}
                >
                  {label(choice)}
                </span>
                <ChevronRightIcon className="shrink-0 text-graphite" />
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <AppDialog
          app={{
            name: editing.name,
            actions: editing.actions,
            permissions: editing.scopes,
          }}
          category="Physical & logical access"
          permissionLabel="Scope"
          choice={
            choices[editing.id] && {
              action: choices[editing.id].action,
              permission: choices[editing.id].scope,
              notes: choices[editing.id].notes,
            }
          }
          onSave={(choice) =>
            apply(editing.id, {
              action: choice.action,
              scope: choice.permission,
              notes: choice.notes,
            })
          }
          onClear={() => apply(editing.id, null)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
