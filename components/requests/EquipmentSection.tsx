"use client";

import {
  useId,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { removeEquipment, saveEquipment } from "@/app/(app)/requests/actions";
import {
  Button,
  ChevronRightIcon,
  InlineError,
  PlusIcon,
  Sheet,
  sheetPill,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  equipmentDetail,
  type EquipmentItem,
  type EquipmentType,
} from "@/lib/requests/equipment";

const fieldClass =
  "h-12 min-w-0 rounded-field border border-field-border px-3 text-base outline-none focus:border-ink md:h-10 md:text-sm";

type Draft = Omit<EquipmentItem, "id" | "typeName">;

/** Add or change one piece of equipment (design: Phone · Add equipment). */
function EquipmentDialog({
  types,
  item,
  onSave,
  onRemove,
  onClose,
}: {
  types: EquipmentType[];
  item: EquipmentItem | null;
  onSave: (draft: Draft) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const descriptionId = useId();
  const tagId = useId();
  const notesId = useId();
  const [typeId, setTypeId] = useState<number | null>(item?.typeId ?? null);
  const [action, setAction] = useState(item?.action ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [assetTag, setAssetTag] = useState(item?.assetTag ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const type = types.find((t) => t.id === typeId);
  const needsDescription = Boolean(type?.needsDescription);
  const complete = Boolean(
    type &&
    type.actions.includes(action) &&
    (!needsDescription || description.trim()),
  );

  const done = () => {
    if (complete && typeId) {
      onSave({
        typeId,
        action,
        description: description.trim() || null,
        assetTag: assetTag.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    }
  };

  return (
    <Sheet
      eyebrow="IT equipment"
      title={item ? item.typeName : "Add equipment"}
      onClose={onClose}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-xs font-semibold">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {types.map((option) => (
            <label
              key={option.id}
              className={sheetPill(
                typeId === option.id,
                cn(
                  "px-3",
                  typeId === option.id
                    ? "border-2 border-ink"
                    : "border border-field-border",
                ),
              )}
            >
              <input
                type="radio"
                name="equipment-type"
                checked={typeId === option.id}
                onChange={() => {
                  setTypeId(option.id);
                  if (!option.actions.includes(action)) setAction("");
                }}
                className="sr-only"
              />
              {option.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={!type}>
        <legend className="pb-2 text-xs font-semibold">Action</legend>
        <div
          className="grid gap-0.75 rounded-pill bg-sand p-0.75"
          style={{
            gridTemplateColumns: `repeat(${type?.actions.length ?? 2}, 1fr)`,
          }}
        >
          {(type?.actions ?? ["Issue", "Return"]).map((option) => (
            <label
              key={option}
              className={sheetPill(
                action === option,
                cn(
                  action === option && "bg-ink text-paper",
                  !type && "cursor-not-allowed text-graphite",
                ),
              )}
            >
              <input
                type="radio"
                name="equipment-action"
                checked={action === option}
                onChange={() => setAction(option)}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={descriptionId} className="text-xs font-semibold">
            Description
            {needsDescription && (
              <span className="font-normal text-graphite"> (required)</span>
            )}
          </label>
          <input
            id={descriptionId}
            value={description}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              needsDescription ? "What is it?" : "e.g. 14″ MacBook Pro"
            }
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={tagId} className="text-xs font-semibold">
            Asset tag / serial
          </label>
          <input
            id={tagId}
            value={assetTag}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => setAssetTag(event.target.value)}
            placeholder="e.g. LN-0042"
            className={fieldClass}
          />
        </div>
      </div>

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
          placeholder="e.g. Ship to Zurich office"
          className={cn(fieldClass, "h-auto resize-none py-2.5 leading-snug")}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={!item}
          onClick={() => {
            onRemove();
            onClose();
          }}
        >
          Remove
        </Button>
        <Button onClick={done} disabled={!complete}>
          Done
        </Button>
      </div>
      <p className="text-center text-xs text-graphite">
        &ldquo;Other&rdquo; needs a description · saved automatically
      </p>
    </Sheet>
  );
}

/**
 * Section 6 — IT equipment: one row per item (several allowed), each opens
 * the sheet; Add equipment below. Saved at once; the database checks it.
 */
export function EquipmentSection({
  requestId,
  types,
  items,
  onItemsChange,
  disabled,
}: {
  requestId: string;
  types: EquipmentType[];
  items: EquipmentItem[];
  onItemsChange: Dispatch<SetStateAction<EquipmentItem[]>>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<EquipmentItem | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const save = (item: EquipmentItem | null, draft: Draft) =>
    startSaving(async () => {
      const result = await saveEquipment({
        requestId,
        itemId: item?.id ?? null,
        ...draft,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      const typeName =
        types.find((t) => t.id === draft.typeId)?.name ?? item?.typeName ?? "";
      const saved = { id: result.id, typeName, ...draft };
      onItemsChange((current) =>
        item
          ? current.map((other) => (other.id === item.id ? saved : other))
          : [...current, saved],
      );
    });

  const remove = (item: EquipmentItem) => {
    onItemsChange((current) => current.filter((other) => other.id !== item.id));
    startSaving(async () => {
      const result = await removeEquipment({ requestId, itemId: item.id });
      if (result.ok) {
        setError(null);
      } else {
        setError(result.message);
        onItemsChange((current) => [...current, item]);
      }
    });
  };

  return (
    <section
      id="s6"
      aria-labelledby="s6-title"
      className="flex scroll-mt-28 flex-col gap-2.5 rounded-card border border-line bg-paper pt-4 pb-3 md:col-span-2 md:scroll-mt-6 md:px-1"
    >
      <div className="flex items-baseline gap-2.5 px-4">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          06
        </span>
        <h2 id="s6-title" className="font-serif text-[21px] md:text-[19px]">
          IT equipment
        </h2>
        <span
          role="status"
          className="ml-auto text-xs font-semibold whitespace-nowrap text-graphite md:text-[11px]"
        >
          {saving
            ? "Saving…"
            : items.length === 1
              ? "1 item"
              : `${items.length} items`}
        </span>
      </div>

      {error && (
        <InlineError live className="px-4">
          {error}
        </InlineError>
      )}

      {items.length > 0 && (
        <ul className="border-t border-line-subtle md:border-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-b border-line-subtle md:border-0"
            >
              <button
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-label={`${item.typeName}, ${item.action}, ${equipmentDetail(item)}. Change`}
                onClick={() => setEditing(item)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left md:min-h-11 md:rounded-[8px] md:px-3 md:hover:bg-sand"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
                  <span className="text-[15px] font-bold md:text-[13px]">
                    {item.typeName}
                  </span>
                  <span className="truncate text-[13px] text-graphite md:text-xs">
                    {equipmentDetail(item)}
                  </span>
                </span>
                <span className="shrink-0 rounded-pill bg-sand px-2.5 py-0.5 text-xs font-bold">
                  {item.action}
                </span>
                <ChevronRightIcon className="shrink-0 text-graphite" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 pt-0.5 md:px-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          iconLeft={<PlusIcon />}
          onClick={() => setEditing("new")}
          className="h-12 w-full md:h-9 md:w-auto"
        >
          Add equipment
        </Button>
      </div>

      {editing && (
        <EquipmentDialog
          types={types}
          item={editing === "new" ? null : editing}
          onSave={(draft) => save(editing === "new" ? null : editing, draft)}
          onRemove={() => editing !== "new" && remove(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
