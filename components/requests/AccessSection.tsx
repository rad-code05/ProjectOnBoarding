"use client";

import {
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  clearAccess,
  removeOther,
  saveOther,
  setAccess,
} from "@/app/(app)/requests/actions";
import {
  Button,
  ChevronRightIcon,
  InlineError,
  PlusIcon,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  choiceLabel,
  filterCatalog,
  type AccessChoice,
  type AccessChoices,
  type CatalogApp,
  type CatalogCategory,
  OTHER_ACTIONS,
  type OtherApp,
} from "@/lib/requests/access";
import { AppDialog } from "./AppDialog";

const selectClass =
  "h-8 min-w-0 rounded-[7px] border border-field-border bg-paper px-1.5 text-xs disabled:bg-sand";

/**
 * Section 5 — Application access. Same data, two layouts: on a phone a
 * compact list where a row opens the edit sheet; on desktop the two-column
 * grid with Action / Permission selects (the app name opens the sheet for
 * notes). Every choice saves at once; the database checks it.
 */
export function AccessSection({
  requestId,
  catalog,
  access,
  onAccessChange,
  others,
  onOthersChange,
  disabled,
}: {
  requestId: string;
  catalog: CatalogCategory[];
  access: AccessChoices;
  onAccessChange: Dispatch<SetStateAction<AccessChoices>>;
  others: OtherApp[];
  onOthersChange: Dispatch<SetStateAction<OtherApp[]>>;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [editing, setEditing] = useState<
    | { kind: "catalog"; app: CatalogApp; category: string }
    | { kind: "other"; item: OtherApp | null }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const total = catalog.reduce(
    (sum, category) => sum + category.apps.length,
    0,
  );
  const setCount = Object.keys(access).length;
  const shown = filterCatalog(catalog, access, query, onlySet);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shownOthers = others.filter((other) =>
    words.every((word) => other.name.toLowerCase().includes(word)),
  );

  /** Adds or changes an "Other" app; it appears once the server has it. */
  const keepOther = (
    item: OtherApp | null,
    choice: AccessChoice,
    name: string,
  ) =>
    startSaving(async () => {
      const result = await saveOther({
        requestId,
        itemId: item?.id ?? null,
        name,
        ...choice,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      const saved = { id: result.id, name, ...choice };
      onOthersChange((current) =>
        item
          ? current.map((other) => (other.id === item.id ? saved : other))
          : [...current, saved],
      );
    });

  const dropOther = (item: OtherApp) => {
    onOthersChange((current) =>
      current.filter((other) => other.id !== item.id),
    );
    startSaving(async () => {
      const result = await removeOther({ requestId, itemId: item.id });
      if (result.ok) {
        setError(null);
      } else {
        setError(result.message);
        onOthersChange((current) => [...current, item]);
      }
    });
  };

  /** Show the change at once; undo it if the server refuses. */
  const apply = (appId: number, choice: AccessChoice | null) => {
    const before = access[appId];
    const put = (value: AccessChoice | undefined) =>
      onAccessChange((current) => {
        const next = { ...current };
        if (value) next[appId] = value;
        else delete next[appId];
        return next;
      });
    put(choice ?? undefined);
    startSaving(async () => {
      const result = choice
        ? await setAccess({ requestId, appId, ...choice })
        : await clearAccess({ requestId, appId });
      if (result.ok) {
        setError(null);
      } else {
        setError(result.message);
        put(before);
      }
    });
  };

  const changeAction = (app: CatalogApp, action: string) => {
    const current = access[app.id];
    apply(
      app.id,
      action
        ? {
            action,
            permission: current?.permission ?? null,
            notes: current?.notes ?? null,
          }
        : null,
    );
  };

  return (
    <section
      id="s5"
      aria-labelledby="s5-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-paper pt-4 pb-2 md:col-span-2 md:px-1"
    >
      <div className="flex items-baseline gap-2.5 px-4">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          05
        </span>
        <h2 id="s5-title" className="font-serif text-[21px] md:text-[19px]">
          Application access
        </h2>
        <span
          role="status"
          className="ml-auto text-xs font-semibold whitespace-nowrap text-graphite md:text-[11px]"
        >
          {saving
            ? "Saving…"
            : `${setCount} of ${total} set${others.length ? ` · ${others.length} other` : ""}`}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-4 md:flex-row md:items-center">
        <input
          type="search"
          aria-label="Find an app"
          placeholder="Find an app"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 min-w-0 rounded-pill border border-field-border bg-paper px-4 text-base outline-none focus:border-ink md:h-9 md:w-64 md:text-[13px]"
        />
        <fieldset className="inline-flex gap-0.75 self-start rounded-pill bg-sand p-0.75 md:self-auto">
          <legend className="sr-only">Show</legend>
          {[
            { label: `All ${total}`, value: false },
            { label: `Set · ${setCount}`, value: true },
          ].map((option) => (
            <label
              key={option.label}
              className="flex h-9.5 cursor-pointer items-center rounded-pill px-3.5 text-[13px] font-medium has-checked:bg-ink has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-ink md:h-7.5 md:text-xs"
            >
              <input
                type="radio"
                name="access-filter"
                checked={onlySet === option.value}
                onChange={() => setOnlySet(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </div>

      {error && (
        <InlineError live className="px-4">
          {error}
        </InlineError>
      )}

      <div className="md:columns-2 md:gap-6 md:px-3">
        {shown.map((category) => (
          <div key={category.id} className="break-inside-avoid md:pb-3">
            <div className="flex items-baseline justify-between border-t border-line-subtle px-4 pt-2.5 pb-1.5 md:border-0 md:px-1">
              <h3 className="text-[11px] font-bold tracking-widest text-graphite uppercase md:text-[10px]">
                {category.name}
              </h3>
              <span className="text-[11px] text-graphite md:hidden">
                {category.apps.filter((app) => access[app.id]).length} of{" "}
                {category.apps.length} set
              </span>
            </div>
            <ul>
              {category.apps.map((app) => {
                const choice = access[app.id];
                return (
                  <li key={app.id}>
                    {/* Phone: the whole row opens the sheet. */}
                    <button
                      type="button"
                      disabled={disabled}
                      aria-haspopup="dialog"
                      aria-label={`${app.name}: ${choice ? choiceLabel(choice) : "not set"}. Change`}
                      onClick={() =>
                        setEditing({
                          kind: "catalog",
                          app,
                          category: category.name,
                        })
                      }
                      className="flex min-h-13 w-full items-center gap-2.5 px-4 py-1.5 text-left md:hidden"
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-pill",
                          choice
                            ? "bg-ink"
                            : "border-[1.5px] border-field-border",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[15px]",
                          choice ? "font-bold" : "font-medium",
                        )}
                      >
                        {app.name}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] whitespace-nowrap",
                          choice ? "font-bold" : "text-graphite",
                        )}
                      >
                        {choiceLabel(choice)}
                      </span>
                      <ChevronRightIcon className="shrink-0 text-graphite" />
                    </button>

                    {/* Desktop: selects in the row; the name opens notes. */}
                    <div
                      className={cn(
                        "hidden items-center gap-2 rounded-[8px] border-[1.5px] py-0.5 pr-1.5 pl-2 md:flex",
                        choice ? "border-line" : "border-transparent",
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        aria-haspopup="dialog"
                        onClick={() =>
                          setEditing({
                            kind: "catalog",
                            app,
                            category: category.name,
                          })
                        }
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-xs hover:underline",
                          choice ? "font-bold" : "font-medium",
                        )}
                      >
                        {app.name}
                        {choice?.notes && (
                          <span className="font-normal text-graphite">
                            {" "}
                            · note
                          </span>
                        )}
                      </button>
                      <select
                        aria-label={`${app.name} action`}
                        disabled={disabled}
                        value={choice?.action ?? ""}
                        onChange={(event) =>
                          changeAction(app, event.target.value)
                        }
                        className={cn(selectClass, "w-24")}
                      >
                        <option value="">—</option>
                        {app.actions.map((action) => (
                          <option key={action}>{action}</option>
                        ))}
                      </select>
                      <select
                        aria-label={`${app.name} permission`}
                        disabled={disabled || !choice}
                        value={choice?.permission ?? ""}
                        onChange={(event) =>
                          choice &&
                          apply(app.id, {
                            ...choice,
                            permission: event.target.value || null,
                          })
                        }
                        className={cn(selectClass, "w-24")}
                      >
                        <option value="">—</option>
                        {app.permissions.map((permission) => (
                          <option key={permission}>{permission}</option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {shownOthers.length > 0 && (
          <div className="break-inside-avoid md:pb-3">
            <div className="flex items-baseline justify-between border-t border-line-subtle px-4 pt-2.5 pb-1.5 md:border-0 md:px-1">
              <h3 className="text-[11px] font-bold tracking-widest text-graphite uppercase md:text-[10px]">
                Other
              </h3>
            </div>
            <ul>
              {shownOthers.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-haspopup="dialog"
                    aria-label={`${other.name}: ${choiceLabel(other)}. Change`}
                    onClick={() => setEditing({ kind: "other", item: other })}
                    className="flex min-h-13 w-full items-center gap-2.5 px-4 py-1.5 text-left md:min-h-9 md:rounded-[8px] md:border-[1.5px] md:border-line md:px-2 md:py-1"
                  >
                    <span className="size-2 shrink-0 rounded-pill bg-ink md:hidden" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold md:text-xs">
                      {other.name}
                    </span>
                    <span className="text-[13px] font-bold whitespace-nowrap md:text-xs">
                      {choiceLabel(other)}
                    </span>
                    <ChevronRightIcon className="shrink-0 text-graphite md:hidden" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {shown.length === 0 && shownOthers.length === 0 && (
          <p className="px-4 py-3 text-sm text-graphite">
            No app matches “{query}”.
          </p>
        )}
      </div>

      <div className="border-t border-line-subtle px-4 pt-2 pb-2 md:border-0 md:pt-0">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          iconLeft={<PlusIcon />}
          onClick={() => setEditing({ kind: "other", item: null })}
          className="h-12 w-full md:h-9 md:w-auto"
        >
          Add other application
        </Button>
      </div>

      {editing?.kind === "catalog" && (
        <AppDialog
          app={editing.app}
          category={editing.category}
          choice={access[editing.app.id]}
          onSave={(choice) => apply(editing.app.id, choice)}
          onClear={() => apply(editing.app.id, null)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "other" && (
        <AppDialog
          app={{
            name: editing.item?.name ?? "",
            actions: OTHER_ACTIONS,
            permissions: null,
          }}
          category="Other application"
          choice={editing.item ?? undefined}
          nameEditable
          onSave={(choice, name) => keepOther(editing.item, choice, name)}
          onClear={() => editing.item && dropOther(editing.item)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
