"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  saveAccessType,
  saveEquipmentType,
  setAccessTypeActive,
  setEquipmentTypeActive,
} from "@/app/(app)/admin/actions";
import { Button, InlineError, Sheet } from "@/components/ui";
import {
  ACCESS_ACTIONS,
  EQUIPMENT_ACTIONS,
  type AdminAccessType,
  type AdminEquipmentType,
} from "@/lib/admin/catalog-shared";
import { cn } from "@/lib/cn";
import {
  ActionToggles,
  OptionChips,
  fieldClass,
  withDraft,
} from "./ListFields";

export type TypeEditing =
  | { kind: "equipment"; type: AdminEquipmentType | null }
  | { kind: "access"; type: AdminAccessType | null };

/**
 * Add or edit an equipment type (section 6) or an access type (section 7)
 * — the same kind of sheet as an application (board: Admin · Equipment &
 * access types). The database checks and records every change.
 */
export function TypeSheet({
  editing,
  onClose,
}: {
  editing: TypeEditing;
  onClose: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const { kind, type } = editing;
  const equipment = kind === "equipment";
  const [name, setName] = useState(type?.name ?? "");
  const [actions, setActions] = useState<string[]>(
    type?.actions ?? (equipment ? ["Issue", "Return"] : ["Grant", "Disable"]),
  );
  const [needsDescription, setNeedsDescription] = useState(
    editing.kind === "equipment"
      ? (editing.type?.needsDescription ?? false)
      : false,
  );
  const [scopes, setScopes] = useState<string[]>(
    editing.kind === "access" ? (editing.type?.scopes ?? []) : [],
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
      equipment
        ? saveEquipmentType({
            id: type?.id ?? null,
            name,
            actions,
            needsDescription,
          })
        : saveAccessType({
            id: type?.id ?? null,
            name,
            actions,
            scopes: withDraft(scopes, draft),
          }),
    );
  const setActive = (active: boolean) =>
    type &&
    run(() =>
      equipment
        ? setEquipmentTypeActive({ id: type.id, active })
        : setAccessTypeActive({ id: type.id, active }),
    );

  const noun = equipment ? "equipment type" : "access type";
  const uses = type?.uses ?? 0;
  const section = equipment
    ? "6 · IT equipment"
    : "7 · Physical & logical access";

  return (
    <Sheet
      eyebrow={
        type
          ? `${section} · used on ${uses} request${uses === 1 ? "" : "s"}`
          : section
      }
      title={type ? `Edit ${type.name}` : `Add ${noun}`}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={save}>
            {type ? "Save changes" : `Add ${noun}`}
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
          className={fieldClass}
        />
        {type && (
          <span className="text-xs text-graphite">
            Renaming changes new requests only — past requests and PDFs keep the
            name they had.
          </span>
        )}
      </div>

      <ActionToggles
        all={equipment ? EQUIPMENT_ACTIONS : ACCESS_ACTIONS}
        value={actions}
        onChange={setActions}
        hint="At least one."
      />

      {equipment ? (
        <label className="flex items-start gap-3 rounded-xl bg-sand px-3.5 py-3 text-sm leading-snug">
          <input
            type="checkbox"
            checked={needsDescription}
            onChange={(e) => setNeedsDescription(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-ink"
          />
          Needs a description (like “Other”: IT must say what it is)
        </label>
      ) : (
        <OptionChips
          legend="Scopes"
          inputLabel="New scope"
          placeholder="e.g. Car park A"
          hint="At least one. These are the choices for Scope in section 7."
          value={scopes}
          onChange={setScopes}
          draft={draft}
          onDraftChange={setDraft}
        />
      )}

      {type && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-3.5",
            type.active ? "border-signal" : "border-line",
          )}
        >
          <span className="text-sm font-bold">
            {type.active ? `Retire ${type.name}` : `${type.name} is retired`}
          </span>
          <span className="text-xs leading-normal text-graphite">
            {type.active
              ? `It disappears from new requests. The ${uses} request${uses === 1 ? "" : "s"} that use it and their PDFs stay as they are. You can restore it later.`
              : "Restore it to offer it on new requests again."}
          </span>
          <Button
            variant={type.active ? "destructive" : "secondary"}
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => setActive(!type.active)}
          >
            {type.active ? `Retire ${noun}` : `Restore ${noun}`}
          </Button>
        </div>
      )}

      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
