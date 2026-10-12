"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui";
import {
  filterApps,
  optionsLine,
  type AdminApp,
  type AdminCategory,
  type AppFilter,
} from "@/lib/admin/catalog-shared";
import { cn } from "@/lib/cn";
import { AppSheet } from "./AppSheet";
import { CategorySheet } from "./CategorySheet";

type Editing =
  | { kind: "app"; app: AdminApp | null }
  | { kind: "category"; category: AdminCategory | null }
  | null;

/**
 * Admin · Applications (board: Phone · Admin · Applications): search,
 * category chips, the apps grouped by category, Add application.
 */
export function AppsAdmin({
  categories,
  apps,
}: {
  categories: AdminCategory[];
  apps: AdminApp[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AppFilter>("all");
  const [editing, setEditing] = useState<Editing>(null);

  const active = apps.filter((a) => a.active);
  const retired = apps.length - active.length;
  const live = categories.filter((c) => c.active);
  const countIn = (categoryId: number) =>
    active.filter((a) => a.categoryId === categoryId).length;
  const groups = filterApps(categories, apps, query, filter);
  const chips: { value: AppFilter; label: string }[] = [
    { value: "all", label: `All · ${active.length}` },
    ...live.map((c) => ({
      value: c.id,
      label: `${c.name} · ${countIn(c.id)}`,
    })),
    { value: "retired", label: `Retired · ${retired}` },
  ];
  const defaultCategory =
    typeof filter === "number" ? filter : (live[0]?.id ?? 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5 pb-24 md:pb-0">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <div className="flex flex-col gap-1.5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[32px] leading-tight">Applications</h1>
          <p className="text-[13px] text-graphite">
            The tools in section 5 of every new request. {active.length} active
            · {retired} retired.
          </p>
        </div>
        <Button
          className="hidden md:inline-flex"
          aria-haspopup="dialog"
          onClick={() => setEditing({ kind: "app", app: null })}
        >
          Add application
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="app-q" className="text-[13px] font-semibold">
          Find an application
        </label>
        <input
          id="app-q"
          type="search"
          value={query}
          placeholder="Name"
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 rounded-field border border-field-border bg-paper px-3.5 text-base md:h-10 md:max-w-sm md:text-sm"
        />
      </div>

      <div
        role="group"
        aria-label="Category"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 whitespace-nowrap md:mx-0 md:flex-wrap md:px-0"
      >
        {chips.map((chip) => {
          const on = filter === chip.value;
          return (
            <button
              key={String(chip.value)}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(chip.value)}
              className={cn(
                "h-9 shrink-0 rounded-pill border px-3.5 text-[13px] font-semibold",
                on ? "border-ink bg-ink text-paper" : "border-line bg-paper",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {groups.length === 0 && (
        <p className="rounded-card border border-line bg-paper p-4 text-sm text-graphite">
          {filter === "retired"
            ? "No retired applications."
            : "No application matches."}
        </p>
      )}

      {groups.map(({ category, apps: rows }) => (
        <section
          key={category.id}
          aria-labelledby={`cat-${category.id}`}
          className="flex flex-col gap-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`cat-${category.id}`} className="font-serif text-xl">
              {category.name} · {rows.length}
            </h2>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setEditing({ kind: "category", category })}
              className="text-[13px] font-semibold underline underline-offset-2"
            >
              Edit category
            </button>
          </div>
          <ul className="rounded-card border border-line bg-paper">
            {rows.map((app) => (
              <li
                key={app.id}
                className="border-b border-line-subtle last:border-b-0"
              >
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setEditing({ kind: "app", app })}
                  className="flex min-h-15 w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-bold">{app.name}</span>
                    <span className="text-xs text-graphite">
                      {optionsLine(app)}
                    </span>
                  </span>
                  <ChevronRightIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setEditing({ kind: "category", category: null })}
        className="self-start text-[13px] font-semibold underline underline-offset-2"
      >
        Add a category
      </button>
      <p className="text-xs leading-normal text-graphite">
        Retired applications disappear from new requests but stay on past
        requests and PDFs. Later, the Laine assistant can suggest an application
        here for you to accept.
      </p>

      <div
        data-sticky-bar
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-sand px-4 pt-3 pb-5 md:hidden"
      >
        <Button
          fullWidth
          aria-haspopup="dialog"
          onClick={() => setEditing({ kind: "app", app: null })}
        >
          Add application
        </Button>
      </div>

      {editing?.kind === "app" && (
        <AppSheet
          app={editing.app}
          categories={categories}
          defaultCategoryId={defaultCategory}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "category" && (
        <CategorySheet
          category={editing.category}
          activeApps={editing.category ? countIn(editing.category.id) : 0}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
