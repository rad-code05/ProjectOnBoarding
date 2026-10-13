"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  clearAccess,
  clearPhysical,
  removeEquipment,
  removeOther,
  saveEquipment,
  saveOther,
  setAccess,
  setPhysical,
} from "@/app/(app)/requests/actions";
import { Button, InlineError, PlusIcon, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AccessResult, CatalogCategory } from "@/lib/requests/access";
import type { EquipmentType, PhysicalType } from "@/lib/requests/equipment";
import type { Removals } from "@/lib/requests/offboarding";

/**
 * Adding and taking off rows of an offboarding (F09d-4, board Offboarding in
 * execution: "Add an app to remove"). Uses the same actions as onboarding;
 * the database allows only removals on an offboarding.
 */
export type RemovalEdit = {
  requestId: string;
  catalog: CatalogCategory[];
  equipmentTypes: EquipmentType[];
  physicalTypes: PhysicalType[];
};

type Kind = "app" | "equipment" | "access";

const ADD_LABEL: Record<Kind, string> = {
  app: "Add an app to remove",
  equipment: "Add equipment to return",
  access: "Add access to disable",
};

const field =
  "h-12 min-w-0 rounded-field border border-field-border bg-paper px-3 text-base md:h-9 md:text-[13px]";

function useStep() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (
    step: () => Promise<AccessResult | { ok: true; id: string }>,
    onDone?: () => void,
  ) =>
    start(async () => {
      setError(null);
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

/** "Take off" a row that isn't done yet (it doesn't apply to this person). */
export function TakeOff({
  edit,
  kind,
  row,
}: {
  edit: RemovalEdit;
  kind: Kind;
  row:
    | Removals["apps"][number]
    | Removals["equipment"][number]
    | Removals["access"][number];
}) {
  const { error, pending, run } = useStep();
  const step = (): Promise<AccessResult> => {
    if (kind === "equipment") {
      return removeEquipment({ requestId: edit.requestId, itemId: row.id });
    }
    if (kind === "access") {
      const access = row as Removals["access"][number];
      return clearPhysical({
        requestId: edit.requestId,
        typeId: access.typeId,
      });
    }
    const app = row as Removals["apps"][number];
    return app.appId === null
      ? removeOther({ requestId: edit.requestId, itemId: app.id })
      : clearAccess({ requestId: edit.requestId, appId: app.appId });
  };
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-label={`Take off ${row.name}`}
        onClick={() => run(step)}
        className="h-11 px-1 text-[13px] font-semibold underline underline-offset-[3px] md:h-8 md:text-xs"
      >
        Take off
      </button>
      {error && <InlineError live>{error}</InlineError>}
    </span>
  );
}

/** The "Add …" button under a section, and its sheet. */
export function AddRemoval({
  edit,
  kind,
  removals,
}: {
  edit: RemovalEdit;
  kind: Kind;
  removals: Removals;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 pt-1 pb-2 md:px-5">
      <Button
        variant="secondary"
        fullWidth
        aria-haspopup="dialog"
        iconLeft={<PlusIcon />}
        onClick={() => setOpen(true)}
        className="md:w-auto"
      >
        {ADD_LABEL[kind]}
      </Button>
      {open && (
        <AddRemovalSheet
          edit={edit}
          kind={kind}
          removals={removals}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function AddRemovalSheet({
  edit,
  kind,
  removals,
  onClose,
}: {
  edit: RemovalEdit;
  kind: Kind;
  removals: Removals;
  onClose: () => void;
}) {
  const id = useId();
  const { error, pending, run } = useStep();
  const listedApps = new Set(removals.apps.map((a) => a.appId));
  const listedAccess = new Set(removals.access.map((a) => a.typeId));
  const apps = edit.catalog
    .flatMap((c) => c.apps.map((a) => ({ ...a, category: c.name })))
    .filter((a) => !listedApps.has(a.id));
  const accessTypes = edit.physicalTypes.filter((t) => !listedAccess.has(t.id));

  const [choice, setChoice] = useState(""); // app id, "other", or type id
  const [other, setOther] = useState("");
  const [had, setHad] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [description, setDescription] = useState("");

  const ready =
    kind === "app"
      ? choice === "other"
        ? other.trim().length > 0
        : choice !== ""
      : choice !== "";

  const save = () => {
    const requestId = edit.requestId;
    if (kind === "app") {
      run(
        () =>
          choice === "other"
            ? saveOther({
                requestId,
                itemId: null,
                name: other,
                action: "Remove",
                permission: had || null,
                notes: null,
              })
            : setAccess({
                requestId,
                appId: Number(choice),
                action: "Remove",
                permission: had || null,
                notes: null,
              }),
        onClose,
      );
    } else if (kind === "equipment") {
      run(
        () =>
          saveEquipment({
            requestId,
            itemId: null,
            typeId: Number(choice),
            action: "Return",
            description: description || null,
            assetTag: assetTag || null,
            notes: null,
          }),
        onClose,
      );
    } else {
      const type = accessTypes.find((t) => String(t.id) === choice);
      run(
        () =>
          setPhysical({
            requestId,
            typeId: Number(choice),
            action: type?.actions.includes("Disable") ? "Disable" : "Remove",
            scope: had || null,
            notes: null,
          }),
        onClose,
      );
    }
  };

  const chosenAccess = accessTypes.find((t) => String(t.id) === choice);
  const chosenApp = apps.find((a) => String(a.id) === choice);

  return (
    <Sheet
      eyebrow={
        kind === "app"
          ? "05 · Applications to remove"
          : kind === "equipment"
            ? "06 · Equipment to return"
            : "07 · Physical & logical access"
      }
      title={ADD_LABEL[kind]}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!ready} onClick={save}>
            Add
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-what`} className="text-[13px] font-semibold">
          {kind === "app"
            ? "Application"
            : kind === "equipment"
              ? "Type"
              : "Access"}
        </label>
        <select
          id={`${id}-what`}
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setHad("");
          }}
          className={field}
        >
          <option value="">Choose…</option>
          {kind === "app" && (
            <>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.category}
                </option>
              ))}
              <option value="other">Other (not in the catalog)…</option>
            </>
          )}
          {kind === "equipment" &&
            edit.equipmentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          {kind === "access" &&
            accessTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </div>

      {kind === "app" && choice === "other" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-other`} className="text-[13px] font-semibold">
            Application name
          </label>
          <input
            id={`${id}-other`}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className={field}
          />
        </div>
      )}

      {kind === "app" && choice !== "" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-had`} className="text-[13px] font-semibold">
            What they had{" "}
            <span className="font-normal text-graphite">(optional)</span>
          </label>
          {chosenApp ? (
            <select
              id={`${id}-had`}
              value={had}
              onChange={(e) => setHad(e.target.value)}
              className={field}
            >
              <option value="">Not known</option>
              {chosenApp.permissions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${id}-had`}
              value={had}
              onChange={(e) => setHad(e.target.value)}
              className={field}
            />
          )}
        </div>
      )}

      {kind === "equipment" && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-tag`} className="text-[13px] font-semibold">
              Asset tag
            </label>
            <input
              id={`${id}-tag`}
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              className={field}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-desc`} className="text-[13px] font-semibold">
              Description
            </label>
            <input
              id={`${id}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={field}
            />
          </div>
        </div>
      )}

      {kind === "access" && chosenAccess && chosenAccess.scopes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-scope`} className="text-[13px] font-semibold">
            Scope <span className="font-normal text-graphite">(optional)</span>
          </label>
          <select
            id={`${id}-scope`}
            value={had}
            onChange={(e) => setHad(e.target.value)}
            className={field}
          >
            <option value="">Not known</option>
            {chosenAccess.scopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      <p
        className={cn(
          "rounded-xl bg-sand px-3.5 py-3 text-xs leading-normal text-graphite",
        )}
      >
        {kind === "app"
          ? "It's added as Remove. You choose Delete, Suspend or Disable when you tick it."
          : kind === "equipment"
            ? "It's added as Return pending."
            : "It's added to be disabled (or removed, if the type can't be disabled)."}
      </p>
      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
