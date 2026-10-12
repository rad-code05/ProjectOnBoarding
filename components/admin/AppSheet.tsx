"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type KeyboardEvent } from "react";
import { saveApp, setAppActive } from "@/app/(app)/admin/actions";
import { Button, CloseIcon, InlineError, Sheet } from "@/components/ui";
import {
  APP_ACTIONS,
  type AdminApp,
  type AdminCategory,
} from "@/lib/admin/catalog-shared";
import { cn } from "@/lib/cn";

const field =
  "h-12 min-w-0 rounded-field border border-field-border bg-paper px-3 text-base outline-none focus:border-ink md:h-10 md:text-sm";

/**
 * Add or edit one application (board: Phone · Edit application (sheet)).
 * The database checks everything again and records the change.
 */
export function AppSheet({
  app,
  categories,
  defaultCategoryId,
  onClose,
}: {
  /** null = a new application. */
  app: AdminApp | null;
  categories: AdminCategory[];
  defaultCategoryId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(app?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    app?.categoryId ?? defaultCategoryId,
  );
  const [actions, setActions] = useState<string[]>(
    app?.actions ?? ["Grant", "Modify", "Remove"],
  );
  const [permissions, setPermissions] = useState<string[]>(
    app?.permissions ?? [],
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (action: string) =>
    setActions((current) =>
      current.includes(action)
        ? current.filter((a) => a !== action)
        : APP_ACTIONS.filter((a) => a === action || current.includes(a)),
    );

  const addPermission = () => {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (!permissions.some((p) => p.toLowerCase() === value.toLowerCase())) {
      setPermissions([...permissions, value]);
    }
    setDraft("");
  };
  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPermission();
    }
  };

  const run = (work: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const result = await work();
      if (!result.ok) {
        setError(result.message ?? "Could not save.");
        return;
      }
      onClose();
      router.refresh();
    });

  const save = () =>
    run(() =>
      saveApp({
        id: app?.id ?? null,
        categoryId,
        name,
        actions,
        permissions: draft.trim() ? [...permissions, draft] : permissions,
      }),
    );
  const setActive = (active: boolean) =>
    app && run(() => setAppActive({ id: app.id, active }));

  // Moving needs an active category; a retired app's own category is listed.
  const choices = categories.filter(
    (c) => c.active || c.id === app?.categoryId,
  );
  const uses = app?.uses ?? 0;

  return (
    <Sheet
      eyebrow={
        app
          ? `Applications · used on ${uses} request${uses === 1 ? "" : "s"}`
          : "Applications"
      }
      title={app ? `Edit ${app.name}` : "Add application"}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={save}>
            {app ? "Save changes" : "Add application"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] font-semibold">
          Name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={app ? `${id}-name-help` : undefined}
          className={field}
        />
        {app && (
          <span id={`${id}-name-help`} className="text-xs text-graphite">
            Renaming changes new requests only — past requests and PDFs keep the
            name they had.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-cat`} className="text-[13px] font-semibold">
          Category
        </label>
        <select
          id={`${id}-cat`}
          value={categoryId}
          onChange={(e) => setCategoryId(Number(e.target.value))}
          className={field}
        >
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (retired)"}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-[13px] font-semibold">
          Allowed actions
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {APP_ACTIONS.map((action) => {
            const on = actions.includes(action);
            return (
              <button
                key={action}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(action)}
                className={cn(
                  "h-10 rounded-pill border px-3.5 text-[13px] font-semibold",
                  on
                    ? "border-ink bg-ink text-paper"
                    : "border-field-border bg-paper",
                )}
              >
                {action}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-graphite">
          At least one. Hexnode uses Enroll / Remove.
        </span>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-[13px] font-semibold">
          Permission options
        </legend>
        {permissions.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {permissions.map((p) => (
              <li
                key={p}
                className="flex h-9 items-center gap-1 rounded-pill bg-sand pr-1 pl-3 text-[13px] font-semibold"
              >
                {p}
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  onClick={() =>
                    setPermissions(permissions.filter((x) => x !== p))
                  }
                  className="flex size-7 items-center justify-center"
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            aria-label="New permission option"
            placeholder="e.g. Dev seat"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKey}
            className={field}
          />
          <Button variant="secondary" size="sm" onClick={addPermission}>
            Add
          </Button>
        </div>
        <span className="text-xs text-graphite">
          At least one. These are the choices in section 5 of a request.
        </span>
      </fieldset>

      {app && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-3.5",
            app.active ? "border-signal" : "border-line",
          )}
        >
          <span className="text-sm font-bold">
            {app.active ? `Retire ${app.name}` : `${app.name} is retired`}
          </span>
          <span className="text-xs leading-normal text-graphite">
            {app.active
              ? `It disappears from new requests. The ${uses} request${uses === 1 ? "" : "s"} that use it and their PDFs stay as they are. You can restore it later.`
              : "Restore it to offer it on new requests again."}
          </span>
          <Button
            variant={app.active ? "destructive" : "secondary"}
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => setActive(!app.active)}
          >
            {app.active ? "Retire application" : "Restore application"}
          </Button>
        </div>
      )}

      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
