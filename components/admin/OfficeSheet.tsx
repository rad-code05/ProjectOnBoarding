"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  saveOffice,
  saveOfficeCity,
  setOfficeActive,
  setOfficeCityActive,
} from "@/app/(app)/admin/actions";
import { Button, InlineError, Sheet, foldText } from "@/components/ui";
import {
  citiesByRegion,
  countriesWithRegions,
  usesLine,
  type AdminCity,
  type AdminOffice,
  type AdminRegion,
} from "@/lib/admin/offices-shared";
import { cn } from "@/lib/cn";
import { countryOptions } from "@/lib/requests/countries";
import { fieldClass } from "./ListFields";

type Result = { ok: boolean; message?: string };

/**
 * Add or edit an office (board: Phone · Add / edit office (sheet)): name,
 * city, country, "ask for a state, then a city"; for an office with states,
 * its cities per state — added and retired straight away; retire / restore
 * the office. The database checks and records every change.
 */
export function OfficeSheet({
  office,
  regions,
  cities,
  onClose,
}: {
  /** null = add a new office. */
  office: AdminOffice | null;
  regions: AdminRegion[];
  cities: AdminCity[];
  onClose: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(office?.name ?? "");
  const [city, setCity] = useState(office?.city ?? "");
  const [country, setCountry] = useState(office?.country ?? "");
  const [usesRegions, setUsesRegions] = useState(office?.usesRegions ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const withRegions = countriesWithRegions(regions);
  const canUseRegions = withRegions.has(country);
  const countryRegions = regions.filter((r) => r.country === country);

  const run = (work: () => Promise<Result>, close: boolean) =>
    start(async () => {
      setError(null);
      const result = await work();
      if (!result.ok) {
        setError(result.message ?? "Could not save.");
        return;
      }
      if (close) onClose();
      router.refresh();
    });

  const save = () => {
    if (!country) {
      setError("Choose the office's country.");
      return;
    }
    run(
      () =>
        saveOffice({
          id: office?.id ?? null,
          name,
          city,
          country,
          usesRegions: canUseRegions && usesRegions,
        }),
      true,
    );
  };

  return (
    <Sheet
      eyebrow={office ? `Offices · ${usesLine(office.uses)}` : "Offices"}
      title={office ? `Edit ${office.name}` : "Add an office"}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={save}>
            {office ? "Save changes" : "Add office"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] font-semibold">
          Office name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
        />
        {office && (
          <span className="text-xs text-graphite">
            Renaming changes new requests only — past requests and PDFs keep the
            name they had.
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-city`} className="text-[13px] font-semibold">
            City <span className="font-medium text-graphite">(optional)</span>
          </label>
          <input
            id={`${id}-city`}
            value={city}
            maxLength={80}
            placeholder="e.g. Geneva"
            onChange={(e) => setCity(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={`${id}-country`}
            className="text-[13px] font-semibold"
          >
            Country
          </label>
          <select
            id={`${id}-country`}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={fieldClass}
          >
            <option value="">Choose…</option>
            {countryOptions().map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <span className="-mt-2 text-xs text-graphite">
        Choosing this office fills the person&rsquo;s work country — still
        editable on the request.
      </span>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1.5 text-[13px] font-semibold">
          State &amp; city
        </legend>
        <label
          className={cn(
            "flex items-start gap-3 rounded-xl bg-sand px-3.5 py-3 text-sm leading-snug",
            !canUseRegions && "text-graphite",
          )}
        >
          <input
            type="checkbox"
            checked={canUseRegions && usesRegions}
            disabled={!canUseRegions}
            onChange={(e) => setUsesRegions(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-ink"
          />
          {canUseRegions
            ? "Ask for a state, then a city, on requests"
            : "States and cities are available for the United States only"}
        </label>
        {office && office.usesRegions && office.country === country && (
          <OfficeCities
            office={office}
            regions={countryRegions}
            cities={cities}
            pending={pending}
            run={(work) => run(work, false)}
          />
        )}
        {office && !office.usesRegions && canUseRegions && usesRegions && (
          <span className="text-xs text-graphite">
            Save, then open the office again to add its cities.
          </span>
        )}
      </fieldset>

      {office && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-3.5",
            office.active ? "border-signal" : "border-line",
          )}
        >
          <span className="text-sm font-bold">
            {office.active
              ? `Retire ${office.name}`
              : `${office.name} is retired`}
          </span>
          <span className="text-xs leading-normal text-graphite">
            {office.active
              ? `It disappears from new requests. The ${office.uses} request${office.uses === 1 ? "" : "s"} that name it and their PDFs keep it. You can restore it later.`
              : "Restore it to offer it on new requests again."}
          </span>
          <Button
            variant={office.active ? "destructive" : "secondary"}
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  setOfficeActive({ id: office.id, active: !office.active }),
                true,
              )
            }
          >
            {office.active ? "Retire office" : "Restore office"}
          </Button>
        </div>
      )}

      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}

/** An office's cities per state, retire / restore each, add one. */
function OfficeCities({
  office,
  regions,
  cities,
  pending,
  run,
}: {
  office: AdminOffice;
  regions: AdminRegion[];
  cities: AdminCity[];
  pending: boolean;
  run: (work: () => Promise<Result>) => void;
}) {
  const id = useId();
  const [regionId, setRegionId] = useState("");
  const [cityName, setCityName] = useState("");
  const [find, setFind] = useState("");
  const q = foldText(find);
  // Find a city: matches the city or its state; matching states open.
  const groups = citiesByRegion(office.id, cities, regions)
    .map((g) => ({
      ...g,
      cities: !q
        ? g.cities
        : foldText(g.region.name).includes(q)
          ? g.cities
          : g.cities.filter((c) => foldText(c.name).includes(q)),
    }))
    .filter((g) => g.cities.length > 0);
  const total = groups.reduce((n, g) => n + g.cities.length, 0);

  const add = () =>
    run(async () => {
      if (!regionId || !cityName.trim()) {
        return { ok: false, message: "Choose a state and type the city." };
      }
      const result = await saveOfficeCity({
        id: null,
        officeId: office.id,
        regionId: Number(regionId),
        name: cityName,
      });
      if (result.ok) setCityName("");
      return result;
    });

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs text-graphite">
        States: all {regions.length} (fixed list). Cities: the big US cities
        (Census, 100,000+ people) and any you add, per state.
      </span>
      <input
        type="search"
        aria-label="Find a city"
        placeholder="Find a city or state"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        className={fieldClass}
      />
      {groups.length === 0 ? (
        <p className="text-xs text-graphite">
          {q ? "No city or state matches." : "No cities yet."}
        </p>
      ) : (
        <ul
          className="flex flex-col gap-1.5"
          aria-label="Cities by state"
          aria-describedby={`${id}-count`}
        >
          {groups.map((g) => (
            <li key={`${g.region.id}-${q ? "find" : "all"}`}>
              <details
                open={Boolean(q) || g.cities.length <= 3}
                className="group rounded-[10px] border border-line-subtle"
              >
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-semibold">
                  <span className="flex-1">{g.region.name}</span>
                  <span className="text-xs font-normal text-graphite">
                    {g.cities.length} cit{g.cities.length === 1 ? "y" : "ies"}
                  </span>
                </summary>
                <ul className="flex flex-col gap-1.5 px-1.5 pb-1.5">
                  {g.cities.map((c) => (
                    <li
                      key={c.id}
                      className="flex min-h-11 items-center gap-2 rounded-[10px] bg-sand py-1 pr-1.5 pl-3"
                    >
                      <span
                        className={cn(
                          "flex-1 text-sm font-semibold",
                          !c.active && "text-graphite line-through",
                        )}
                      >
                        {c.name}
                      </span>
                      <span className="text-xs text-graphite">
                        {c.active ? usesLine(c.uses) : "retired"}
                      </span>
                      <Button
                        variant="text"
                        size="sm"
                        disabled={pending}
                        aria-label={`${c.active ? "Retire" : "Restore"} ${c.name}, ${g.region.name}`}
                        onClick={() =>
                          run(() =>
                            setOfficeCityActive({
                              id: c.id,
                              active: !c.active,
                            }),
                          )
                        }
                      >
                        {c.active ? "Retire" : "Restore"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      <span id={`${id}-count`} className="text-xs text-graphite">
        {total} cit{total === 1 ? "y" : "ies"} in {groups.length} state
        {groups.length === 1 ? "" : "s"}
        {q ? " match" : ""}
      </span>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <select
          aria-label="State of the new city"
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          className={fieldClass}
        >
          <option value="">State…</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input
          id={`${id}-new-city`}
          aria-label="New city"
          value={cityName}
          maxLength={80}
          placeholder="e.g. Miami"
          onChange={(e) => setCityName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={fieldClass}
        />
        <Button variant="secondary" disabled={pending} onClick={add}>
          Add
        </Button>
      </div>
      <span className="text-xs text-graphite">
        Both optional on the request. Reports break the office down by state and
        city.
      </span>
    </div>
  );
}
