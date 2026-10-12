"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui";
import {
  typeLine,
  type AdminAccessType,
  type AdminEquipmentType,
} from "@/lib/admin/catalog-shared";
import { TypeSheet, type TypeEditing } from "./TypeSheet";

/**
 * Admin · Equipment & access types (board of the same name): the choices in
 * sections 6 and 7, each opening the same kind of sheet as an application.
 */
export function TypesAdmin({
  equipment,
  access,
}: {
  equipment: AdminEquipmentType[];
  access: AdminAccessType[];
}) {
  const [editing, setEditing] = useState<TypeEditing | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[32px] leading-tight">
          Equipment &amp; access types
        </h1>
        <p className="text-[13px] text-graphite">
          The choices in sections 6 and 7 of every new request.
        </p>
      </div>

      <TypeList
        id="eq"
        title="6 · IT equipment"
        rows={equipment}
        addLabel="Add equipment type"
        onOpen={(type) => setEditing({ kind: "equipment", type })}
      />
      <TypeList
        id="pa"
        title="7 · Physical & logical access"
        rows={access}
        addLabel="Add access type"
        onOpen={(type) => setEditing({ kind: "access", type })}
      />

      <p className="text-xs leading-normal text-graphite">
        Retire instead of delete: retired types disappear from new requests, and
        past requests keep their names.
      </p>

      {editing && (
        <TypeSheet editing={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function TypeList<T extends AdminEquipmentType | AdminAccessType>({
  id,
  title,
  rows,
  addLabel,
  onOpen,
}: {
  id: string;
  title: string;
  rows: T[];
  addLabel: string;
  /** null = add a new one. */
  onOpen: (type: T | null) => void;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h2 id={`${id}-title`} className="font-serif text-[21px]">
        {title}
      </h2>
      <ul className="rounded-card border border-line bg-paper">
        {rows.map((type) => (
          <li
            key={type.id}
            className="border-b border-line-subtle last:border-b-0"
          >
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => onOpen(type)}
              className="flex min-h-15 w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">
                  {type.name}
                  {!type.active && (
                    <span className="ml-2 rounded-pill bg-sand px-2 py-0.5 text-[11px] font-bold text-graphite">
                      Retired
                    </span>
                  )}
                </span>
                <span className="text-xs text-graphite">{typeLine(type)}</span>
              </span>
              <ChevronRightIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="self-start"
        aria-haspopup="dialog"
        onClick={() => onOpen(null)}
      >
        {addLabel}
      </Button>
    </section>
  );
}
