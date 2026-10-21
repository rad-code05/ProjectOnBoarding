import { countryName } from "@/lib/requests/labels";

/** "Onboarded by …" reports (F13b, office F27d): the same page, grouped differently. */
export type ReportGroup = "country" | "department" | "office";

/** The report page of each grouping. */
export const GROUP_SLUGS = {
  country: "onboarded-by-country",
  department: "onboarded-by-department",
  office: "onboarded-by-office",
} as const satisfies Record<ReportGroup, string>;

export type GroupRow = {
  /** Country code / department or office id; null = not filled in on the request. */
  key: string | null;
  label: string;
  onboarded: number;
  /** "30%" of the period's total. */
  share: string;
};

export const GROUP_WORDS: Record<
  ReportGroup,
  { one: string; many: string; label: string; none: string; column: string }
> = {
  country: {
    one: "country",
    many: "countries",
    label: "Countries",
    none: "No country",
    column: "Country",
  },
  department: {
    one: "department",
    many: "departments",
    label: "Departments",
    none: "No department",
    column: "Department",
  },
  office: {
    one: "office",
    many: "offices",
    label: "Offices",
    none: "Office not set",
    column: "Office",
  },
};

/**
 * Rows from report_onboarded_by() in plain words, biggest first (the
 * database's order): country names, "No country" for an empty one, and each
 * group's share of the total, rounded to whole per cent.
 */
export function groupRows(
  rows: { key: string | null; label: string | null; onboarded: number }[],
  group: ReportGroup,
): { rows: GroupRow[]; total: number } {
  const total = rows.reduce((sum, r) => sum + r.onboarded, 0);
  return {
    total,
    rows: rows.map((r) => ({
      key: r.key,
      label:
        r.key === null
          ? GROUP_WORDS[group].none
          : group === "country"
            ? countryName(r.key)
            : (r.label ?? GROUP_WORDS[group].none),
      onboarded: r.onboarded,
      share: total ? `${Math.round((r.onboarded / total) * 100)}%` : "0%",
    })),
  };
}

/** The two tiles: how many groups had onboardings, and the biggest one. */
export function groupTiles(rows: GroupRow[], group: ReportGroup) {
  const named = rows.filter((r) => r.key !== null);
  const top = rows[0];
  return {
    groups: named.length,
    top: top
      ? { value: top.onboarded, note: `${top.label} · ${top.share}` }
      : null,
    words: GROUP_WORDS[group],
  };
}
