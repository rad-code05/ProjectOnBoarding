"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, CloseIcon, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AccessChoice } from "@/lib/requests/access";

export type DialogApp = {
  name: string;
  actions: string[];
  /** null = free text (an "Other" app has no catalog options). */
  permissions: string[] | null;
};

const fieldClass =
  "rounded-field border border-field-border px-3 text-base outline-none focus:border-ink md:text-sm";

/**
 * Edit one app of section 5: action, permission, notes — and the name for
 * an "Other" app. A native <dialog> (focus stays inside, Esc closes). Bottom
 * sheet on a phone, centred window on desktop (design: Phone · Edit an app).
 */
export function AppDialog({
  app,
  category,
  choice,
  nameEditable = false,
  onSave,
  onClear,
  onClose,
}: {
  app: DialogApp;
  category: string;
  /** Current values; undefined = the app is not on the request yet. */
  choice: AccessChoice | undefined;
  nameEditable?: boolean;
  onSave: (choice: AccessChoice, name: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const nameId = useId();
  const permissionId = useId();
  const notesId = useId();
  const [name, setName] = useState(app.name);
  const [action, setAction] = useState(choice?.action ?? "");
  const [permission, setPermission] = useState(choice?.permission ?? "");
  const [notes, setNotes] = useState(choice?.notes ?? "");
  const complete = Boolean(action && name.trim());

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const done = () => {
    if (complete) {
      onSave(
        { action, permission: permission.trim() || null, notes: notes || null },
        name.trim(),
      );
    }
    onClose();
  };

  const pill = (on: boolean) =>
    cn(
      "flex h-11 cursor-pointer items-center justify-center rounded-pill text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
      on ? "font-bold" : "font-medium",
    );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none rounded-t-[20px] bg-paper p-0 text-ink backdrop:bg-ink/45 md:inset-0 md:m-auto md:max-w-md md:rounded-[18px]"
    >
      <div className="flex flex-col gap-4.5 px-4 pt-2.5 pb-6 md:p-6">
        <span
          aria-hidden="true"
          className="h-1 w-10 self-center rounded-pill bg-field-border md:hidden"
        />
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
              {category}
            </span>
            <h2 id={titleId} className="font-serif text-[28px] leading-tight">
              {nameEditable ? name.trim() || "Other application" : app.name}
            </h2>
          </div>
          <IconButton label="Close" icon={<CloseIcon />} onClick={onClose} />
        </div>

        {nameEditable && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-xs font-semibold">
              Application name
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Notion"
              className={cn(fieldClass, "h-12 md:h-10")}
            />
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-xs font-semibold">Action</legend>
          <div
            className="grid gap-0.75 rounded-pill bg-sand p-0.75"
            style={{
              gridTemplateColumns: `repeat(${app.actions.length}, 1fr)`,
            }}
          >
            {app.actions.map((option) => (
              <label
                key={option}
                className={cn(
                  pill(action === option),
                  action === option && "bg-ink text-paper",
                )}
              >
                <input
                  type="radio"
                  name="action"
                  value={option}
                  checked={action === option}
                  onChange={() => setAction(option)}
                  className="sr-only"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        {app.permissions ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-semibold">Permission</legend>
            <div className="flex flex-wrap gap-2">
              {app.permissions.map((option) => (
                <label
                  key={option}
                  className={cn(
                    pill(permission === option),
                    "px-4.5",
                    permission === option
                      ? "border-2 border-ink"
                      : "border border-field-border",
                  )}
                >
                  <input
                    type="radio"
                    name="permission"
                    value={option}
                    checked={permission === option}
                    onChange={() => setPermission(option)}
                    className="sr-only"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={permissionId} className="text-xs font-semibold">
              Permission / role{" "}
              <span className="font-normal text-graphite">(optional)</span>
            </label>
            <input
              id={permissionId}
              value={permission}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => setPermission(event.target.value)}
              placeholder="e.g. Member"
              className={cn(fieldClass, "h-12 md:h-10")}
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
            placeholder="e.g. Design team workspace only"
            className={cn(fieldClass, "resize-none py-2.5 leading-snug")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              onClear();
              onClose();
            }}
            disabled={!choice}
          >
            Clear
          </Button>
          <Button onClick={done} disabled={nameEditable && !complete}>
            Done
          </Button>
        </div>
        <p className="text-center text-xs text-graphite">
          {nameEditable && !choice
            ? "Choose a name and an action to add it"
            : `Saved automatically · Clear removes ${name.trim() || "it"} from this request`}
        </p>
      </div>
    </dialog>
  );
}
