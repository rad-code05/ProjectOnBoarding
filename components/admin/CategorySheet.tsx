"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { saveCategory, setCategoryActive } from "@/app/(app)/admin/actions";
import { Button, InlineError, Sheet } from "@/components/ui";
import type { AdminCategory } from "@/lib/admin/catalog-shared";

/** Add or rename a category; retire it once it has no active apps. */
export function CategorySheet({
  category,
  activeApps,
  onClose,
}: {
  /** null = a new category. */
  category: AdminCategory | null;
  activeApps: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(category?.name ?? "");
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

  return (
    <Sheet
      eyebrow="Applications · category"
      title={category ? `Edit ${category.name}` : "Add a category"}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(() => saveCategory({ id: category?.id ?? null, name }))
            }
          >
            {category ? "Save changes" : "Add category"}
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
          className="h-12 rounded-field border border-field-border bg-paper px-3 text-base outline-none focus:border-ink md:h-10 md:text-sm"
        />
      </div>
      {category && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3.5">
          <span className="text-xs leading-normal text-graphite">
            {category.active
              ? activeApps > 0
                ? `It still has ${activeApps} active application${activeApps === 1 ? "" : "s"} — move or retire them first.`
                : "No active applications — it can be retired."
              : "Retired. Restore it to use it again."}
          </span>
          <Button
            variant={category.active ? "destructive" : "secondary"}
            size="sm"
            className="self-start"
            disabled={pending || (category.active && activeApps > 0)}
            onClick={() =>
              run(() =>
                setCategoryActive({
                  id: category.id,
                  active: !category.active,
                }),
              )
            }
          >
            {category.active ? "Retire category" : "Restore category"}
          </Button>
        </div>
      )}
      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
