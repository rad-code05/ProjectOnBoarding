"use client";

import { useId, useState, useTransition } from "react";
import { keepHeld, setHeldChange } from "@/app/(app)/requests/actions";
import { Button, InlineError, Sheet, sheetPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { joinRoles, splitRoles } from "@/lib/requests/access";
import {
  heldChoice,
  heldLabel,
  heldSummary,
  isSameAsToday,
  type HeldItem,
  type HeldKind,
} from "@/lib/requests/access-change";

/**
 * Access change (F10c, boards Phone · Access change draft and Change an
 * app's permission): what the person has today, each row kept, changed or
 * removed. A kept row has no line on the request; the database checks every
 * change (F10a).
 */

const NOUNS: Record<HeldKind, [string, string]> = {
  application: ["application", "applications"],
  equipment: ["device", "devices"],
  access: ["access type", "access types"],
};

function count(n: number, kind: HeldKind) {
  const [one, many] = NOUNS[kind];
  return `${n} ${n === 1 ? one : many}`;
}

/** "What Anna has today, from her access inventory: 9 applications, …" */
export function InventoryNote({
  firstName,
  held,
}: {
  firstName: string;
  held: HeldItem[];
}) {
  const who = firstName || "This person";
  const parts = (["application", "equipment", "access"] as const)
    .map((kind) => [kind, held.filter((h) => h.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => count(n, kind));
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-3 text-[13px] leading-normal md:col-span-2">
      {held.length === 0 ? (
        <span>
          Nothing on record for {who} yet — add what changes in sections 5–7.
        </span>
      ) : (
        <span>
          What {who} has today, from the <strong>access inventory</strong>:{" "}
          {parts.join(", ")}. <strong>Everything is kept</strong> unless you
          change or remove it. Nothing changes in the inventory until the
          approver closes this request.
        </span>
      )}
    </div>
  );
}

const TITLES: Record<HeldKind, string> = {
  application: "Applications they have",
  equipment: "Devices they have",
  access: "Access they have",
};

/** One list (apps, devices or access) of held rows. */
export function HeldSection({
  requestId,
  kind,
  firstName,
  items,
  onItemsChange,
  disabled,
}: {
  requestId: string;
  kind: HeldKind;
  firstName: string;
  /** All held items; this section shows its own kind. */
  items: HeldItem[];
  onItemsChange: (items: HeldItem[]) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<HeldItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const titleId = useId();
  const mine = items.filter((item) => item.kind === kind);
  if (mine.length === 0) return null;
  const summary = heldSummary(mine);

  const put = (inventoryId: string, change: HeldItem["change"]) =>
    items.map((item) =>
      item.inventoryId === inventoryId ? { ...item, change } : item,
    );

  // Shows the choice at once; undone if the database refuses it.
  const save = (item: HeldItem, change: HeldItem["change"]) => {
    const before = items;
    onItemsChange(put(item.inventoryId, change));
    setError(null);
    start(async () => {
      const result = change
        ? await setHeldChange({
            requestId,
            kind,
            inventoryId: item.inventoryId,
            action: change.action,
            value: change.value,
            notes: change.notes,
          })
        : await keepHeld({ requestId, kind, inventoryId: item.inventoryId });
      if (!result.ok) {
        setError(result.message);
        onItemsChange(before);
      }
    });
  };
  const keep = (item: HeldItem) => item.change && save(item, null);
  const remove = (item: HeldItem) =>
    save(item, {
      itemId: item.change?.itemId ?? "",
      action: item.removeAction,
      value: item.current,
      notes: item.change?.notes ?? null,
    });

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4 md:col-span-2"
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 id={titleId} className="font-serif text-[21px] md:text-[19px]">
          {TITLES[kind]}
        </h2>
        <span className="ml-auto text-xs font-semibold text-graphite">
          {[
            summary.change && `${summary.change} changed`,
            summary.remove &&
              `${summary.remove} ${kind === "equipment" ? "to return" : "removed"}`,
            `${summary.keep} kept`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {mine.map((item) => (
          <HeldRow
            key={item.inventoryId}
            item={item}
            disabled={disabled}
            onKeep={() => keep(item)}
            onChange={() => setEditing(item)}
            onRemove={() => remove(item)}
          />
        ))}
      </ul>
      {error && <InlineError live>{error}</InlineError>}
      {editing && (
        <ChangeSheet
          item={editing}
          firstName={firstName}
          onClose={() => setEditing(null)}
          onKeep={() => keep(editing)}
          onSave={(value, notes) =>
            save(editing, {
              itemId: editing.change?.itemId ?? "",
              action: editing.changeAction ?? "Modify",
              value,
              notes,
            })
          }
        />
      )}
    </section>
  );
}

function HeldRow({
  item,
  disabled,
  onKeep,
  onChange,
  onRemove,
}: {
  item: HeldItem;
  disabled: boolean;
  onKeep: () => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  const choice = heldChoice(item);
  const removeLabel = item.kind === "equipment" ? "Return" : "Remove";
  const options: [string, string, () => void][] = [
    ["keep", "Keep", onKeep],
    ...(item.changeAction
      ? [["change", "Change", onChange] as [string, string, () => void]]
      : []),
    ["remove", removeLabel, onRemove],
  ];
  const sub =
    item.kind === "equipment"
      ? [item.assetTag, item.grantedTicket && `issued on ${item.grantedTicket}`]
      : [item.category];
  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-xl px-3.5 py-3",
        choice === "keep" ? "border border-line" : "border-2 border-ink",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-bold">{item.name}</span>
          <span className="text-xs text-graphite">
            {sub.filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-right text-[13px]",
            choice === "keep" ? "font-medium" : "font-bold",
          )}
        >
          {heldLabel(item)}
        </span>
      </div>
      <fieldset disabled={disabled}>
        <legend className="sr-only">
          {item.name}: keep, {item.changeAction ? "change or " : ""}
          {removeLabel.toLowerCase()}
        </legend>
        <div
          className="grid gap-0.75 rounded-pill bg-sand p-0.75"
          style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
        >
          {options.map(([value, label, act]) => (
            <label
              key={value}
              className={sheetPill(
                choice === value,
                choice === value ? "bg-ink text-paper" : undefined,
              )}
            >
              <input
                type="radio"
                name={`held-${item.inventoryId}`}
                value={value}
                checked={choice === value}
                // "Change" opens the sheet even when already changed.
                onChange={act}
                onClick={
                  value === "change" && choice === "change" ? act : undefined
                }
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {choice !== "keep" && item.kind !== "equipment" && (
        <span className="text-xs leading-snug text-graphite">
          {choice === "remove"
            ? `Had ${item.current ?? "access"} · removed when the approver closes the request`
            : `Changed from ${item.current ?? "—"}`}
        </span>
      )}
    </li>
  );
}

/** "Change Figma": what they have today, the new permission or scope. */
export function ChangeSheet({
  item,
  firstName,
  onClose,
  onKeep,
  onSave,
}: {
  item: HeldItem;
  firstName: string;
  onClose: () => void;
  onKeep: () => void;
  onSave: (value: string | null, notes: string | null) => void;
}) {
  const notesId = useId();
  const typedId = useId();
  const [value, setValue] = useState(
    item.change && heldChoice(item) === "change"
      ? (item.change.value ?? "")
      : "",
  );
  const [notes, setNotes] = useState(item.change?.notes ?? "");
  const roles = splitRoles(value);
  const same = isSameAsToday(item, value || null);
  const ready = Boolean(value.trim()) && !same;
  const noun = item.kind === "access" ? "scope" : "permission";
  const label = item.multiple ? "New roles" : `New ${noun}`;

  const pick = (option: string, on: boolean) =>
    setValue(
      item.multiple
        ? (joinRoles(
            on ? [...roles, option] : roles.filter((r) => r !== option),
            item.options,
          ) ?? "")
        : option,
    );

  return (
    <Sheet
      eyebrow={`Change${item.category ? ` · ${item.category}` : ""}`}
      title={item.name}
      onClose={onClose}
    >
      <div className="flex flex-col gap-0.75 rounded-xl bg-sand px-3.5 py-3">
        <span className="text-xs font-semibold text-graphite">
          {firstName || "They"} {firstName ? "has" : "have"} today
        </span>
        <span className="text-base font-bold">{item.current ?? "—"}</span>
        {item.grantedTicket && (
          <span className="text-xs text-graphite">
            Granted on {item.grantedTicket}
          </span>
        )}
      </div>

      {item.options.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-xs font-semibold">{label}</legend>
          <div
            className={cn(
              "flex gap-2",
              item.multiple ? "flex-col" : "flex-wrap",
            )}
          >
            {item.options.map((option) => {
              const on = item.multiple
                ? roles.includes(option)
                : value === option;
              const today = splitRoles(item.current).includes(option);
              return (
                <label
                  key={option}
                  className={cn(
                    item.multiple
                      ? "flex min-h-11 items-center gap-3 rounded-field px-3 text-sm"
                      : sheetPill(on, "px-4.5"),
                    on
                      ? "border-2 border-ink font-bold"
                      : today
                        ? "border border-dashed border-graphite text-graphite"
                        : "border border-field-border",
                  )}
                >
                  <input
                    type={item.multiple ? "checkbox" : "radio"}
                    name="held-option"
                    checked={on}
                    onChange={(event) => pick(option, event.target.checked)}
                    className={
                      item.multiple ? "size-5 shrink-0 accent-ink" : "sr-only"
                    }
                  />
                  {option}
                  {today && !item.multiple ? " · today" : ""}
                </label>
              );
            })}
          </div>
          {same && value && (
            <span className="text-xs text-graphite">
              That is what {firstName || "they"} {firstName ? "has" : "have"}{" "}
              today — pick a different one, or keep it.
            </span>
          )}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={typedId} className="text-xs font-semibold">
            {label}
          </label>
          <input
            id={typedId}
            value={value}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            className="h-12 rounded-field border border-field-border px-3 text-base md:h-10 md:text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={notesId} className="text-xs font-semibold">
          Notes <span className="font-normal text-graphite">(optional)</span>
        </label>
        <textarea
          id={notesId}
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="resize-none rounded-field border border-field-border px-3 py-2.5 text-base leading-snug md:text-sm"
        />
      </div>

      <div className="grid grid-cols-[1fr_1.3fr] gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            onKeep();
            onClose();
          }}
        >
          Keep{" "}
          {item.current && item.current.length <= 16 ? item.current : "as is"}
        </Button>
        <Button
          disabled={!ready}
          onClick={() => {
            onSave(value.trim() || null, notes.trim() || null);
            onClose();
          }}
        >
          {ready && value.length <= 16 ? `Change to ${value}` : "Save change"}
        </Button>
      </div>
      <p className="text-center text-xs leading-normal text-graphite">
        Saved automatically. The inventory shows the change only once the
        approver closes the request.
      </p>
    </Sheet>
  );
}
