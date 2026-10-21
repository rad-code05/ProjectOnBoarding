"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui";
import {
  citiesByRegion,
  officeLine,
  officePlace,
  usesLine,
  type AdminCity,
  type AdminOffice,
  type AdminRegion,
} from "@/lib/admin/offices-shared";
import { OfficeSheet } from "./OfficeSheet";

/**
 * Admin · Offices (board: Phone · Admin · Offices): where people work —
 * the choices in section 2 and the offices reports group by. Each row opens
 * the office sheet; offices with states list their cities per state.
 */
export function OfficesAdmin({
  offices,
  regions,
  cities,
}: {
  offices: AdminOffice[];
  regions: AdminRegion[];
  cities: AdminCity[];
}) {
  // The office being edited (by id, so a refresh shows its new cities);
  // "new" = adding one.
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const active = offices.filter((o) => o.active).length;
  const open =
    editing === "new" ? null : (offices.find((o) => o.id === editing) ?? null);
  const withRegions = offices.filter((o) => o.active && o.usesRegions);

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
        <h1 className="font-serif text-[32px] leading-tight">Offices</h1>
        <p className="text-[13px] leading-normal text-graphite">
          Where people work — chosen in section 2 of every request, and used by
          the reports. {active} active · {offices.length - active} retired.
        </p>
      </div>

      <Button
        className="self-start"
        aria-haspopup="dialog"
        onClick={() => setEditing("new")}
      >
        Add an office
      </Button>

      <ul className="rounded-card border border-line bg-paper">
        {offices.map((office) => (
          <li
            key={office.id}
            className="border-b border-line-subtle last:border-b-0"
          >
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setEditing(office.id)}
              className="flex min-h-16 w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">
                  {office.name}
                  {!office.active && (
                    <span className="ml-2 rounded-pill bg-sand px-2 py-0.5 text-[11px] font-bold text-graphite">
                      Retired
                    </span>
                  )}
                </span>
                <span className="text-xs text-graphite">
                  {officePlace(office)}
                </span>
                <span className="text-xs text-graphite">
                  {officeLine(office, cities)}
                </span>
              </span>
              <span className="text-xs font-semibold whitespace-nowrap">
                {usesLine(office.uses)}
              </span>
              <ChevronRightIcon size={18} />
            </button>
          </li>
        ))}
      </ul>

      {withRegions.map((office) => {
        const groups = citiesByRegion(
          office.id,
          cities.filter((c) => c.active),
          regions,
        );
        return (
          <section
            key={office.id}
            aria-labelledby={`cities-${office.id}`}
            className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5"
          >
            <div className="flex items-baseline justify-between">
              <h2 id={`cities-${office.id}`} className="font-serif text-xl">
                {office.name} · states &amp; cities
              </h2>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setEditing(office.id)}
                className="text-[13px] font-semibold underline"
              >
                Edit
              </button>
            </div>
            {groups.length === 0 ? (
              <p className="text-[13px] text-graphite">
                No cities yet — open the office to add one.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.map((g) => (
                  <li key={g.region.id} className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold">{g.region.name}</span>
                    <span className="text-[13px] text-graphite">
                      {g.cities.map((c) => c.name).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <span className="text-xs leading-normal text-graphite">
              All {regions.filter((r) => r.country === office.country).length}{" "}
              states are listed on requests. Cities are yours: add one when
              someone starts somewhere new.
            </span>
          </section>
        );
      })}

      <p className="text-xs leading-normal text-graphite">
        Retired offices disappear from new requests but stay on past requests,
        records and reports. Every change is in the audit log. Later the Laine
        assistant can prepare an office here for you to confirm.
      </p>

      {editing !== null && (
        <OfficeSheet
          key={editing}
          office={open}
          regions={regions}
          cities={cities}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
