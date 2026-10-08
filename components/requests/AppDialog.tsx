"use client";

import { useId, useState } from "react";
import { Button, Sheet, sheetPill } from "@/components/ui";
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
 * Edit one row of section 5 (an app) or section 7 (an access type): action,
 * permission or scope, notes — and the name for an "Other" app.
 */
export function AppDialog({
  app,
  category,
  choice,
  nameEditable = false,
  permissionLabel = "Permission",
  onSave,
  onClear,
  onClose,
}: {
  app: DialogApp;
  category: string;
  /** Current values; undefined = the row is not on the request yet. */
  choice: AccessChoice | undefined;
  nameEditable?: boolean;
  /** "Permission" for apps, "Scope" for physical & logical access. */
  permissionLabel?: string;
  onSave: (choice: AccessChoice, name: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const nameId = useId();
  const permissionId = useId();
  const notesId = useId();
  const [name, setName] = useState(app.name);
  const [action, setAction] = useState(choice?.action ?? "");
  const [permission, setPermission] = useState(choice?.permission ?? "");
  const [notes, setNotes] = useState(choice?.notes ?? "");
  const complete = Boolean(action && name.trim());

  const done = () => {
    if (complete) {
      onSave(
        { action, permission: permission.trim() || null, notes: notes || null },
        name.trim(),
      );
    }
    onClose();
  };

  return (
    <Sheet
      eyebrow={category}
      title={nameEditable ? name.trim() || "Other application" : app.name}
      onClose={onClose}
    >
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
              className={sheetPill(
                action === option,
                action === option ? "bg-ink text-paper" : undefined,
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
          <legend className="pb-2 text-xs font-semibold">
            {permissionLabel}
          </legend>
          <div className="flex flex-wrap gap-2">
            {app.permissions.map((option) => (
              <label
                key={option}
                className={sheetPill(
                  permission === option,
                  cn(
                    "px-4.5",
                    permission === option
                      ? "border-2 border-ink"
                      : "border border-field-border",
                  ),
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
    </Sheet>
  );
}
