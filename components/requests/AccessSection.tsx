"use client";

import {
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { clearAccess, setAccess } from "@/app/(app)/requests/actions";
import { ChevronRightIcon, InlineError } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  choiceLabel,
  filterCatalog,
  type AccessChoice,
  type AccessChoices,
  type CatalogApp,
  type CatalogCategory,
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
  disabled,
}: {
  requestId: string;
  catalog: CatalogCategory[];
  access: AccessChoices;
  onAccessChange: Dispatch<SetStateAction<AccessChoices>>;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [onlySet, setOnlySet] = useState(false);
  const [editing, setEditing] = useState<{
    app: CatalogApp;
    category: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const total = catalog.reduce(
    (sum, category) => sum + category.apps.length,
    0,
  );
  const setCount = Object.keys(access).length;
  const shown = filterCatalog(catalog, access, query, onlySet);

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
      className="flex scroll-mt-28 flex-col gap-3 rounded-card border border-line bg-paper pt-4 pb-2 md:col-span-2 md:scroll-mt-6 md:px-1"
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
          {saving ? "Saving…" : `${setCount} of ${total} set`}
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
                        setEditing({ app, category: category.name })
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
                          setEditing({ app, category: category.name })
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
        {shown.length === 0 && (
          <p className="px-4 py-3 text-sm text-graphite">
            No app matches “{query}”.
          </p>
        )}
      </div>

      {editing && (
        <AppDialog
          app={editing.app}
          category={editing.category}
          choice={access[editing.app.id]}
          onSave={(choice) => apply(editing.app.id, choice)}
          onClear={() => apply(editing.app.id, null)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
