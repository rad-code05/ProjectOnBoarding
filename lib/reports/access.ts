import { formatDay } from "@/lib/requests/format";
import { countryName, personName } from "@/lib/requests/labels";
import type { GroupRow } from "./groups";

/** The three tabs of Access by application (board: Phone · Access by application). */
export const ACCESS_KINDS = ["application", "equipment", "access"] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

export const ACCESS_KIND_INFO: Record<
  AccessKind,
  {
    tab: string;
    /** "29 of 38 applications in use". */
    plural: string;
    /** Bars heading. */
    bars: string;
    /** "Show all 29 applications". */
    all: string;
    /** Column / pill heading for a holder's row. */
    detail: string;
  }
> = {
  application: {
    tab: "Applications",
    plural: "applications",
    bars: "People per application",
    all: "applications",
    detail: "Permission",
  },
  equipment: {
    tab: "Devices",
    plural: "device types",
    bars: "People per device type",
    all: "device types",
    detail: "Asset tag",
  },
  access: {
    tab: "Access",
    plural: "access types",
    bars: "People per access type",
    all: "access types",
    detail: "Scope",
  },
};

/** "application" unless the URL names another tab. */
export function parseAccessKind(
  value: string | string[] | undefined,
): AccessKind {
  const v = Array.isArray(value) ? value[0] : value;
  return (ACCESS_KINDS as readonly string[]).includes(v ?? "")
    ? (v as AccessKind)
    : "application";
}

/** An item key as the database writes it ("app:12", "other:notion", "equipment:3"). */
export function parseItemKey(
  value: string | string[] | undefined,
): string | null {
  const v = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return /^(app|equipment|access):\d{1,5}$|^other:.{1,80}$/.test(v) ? v : null;
}

/** Link to the people holding one item, keeping the filters and the search. */
export function holdersHref(
  kind: AccessKind,
  itemKey: string,
  params: URLSearchParams,
): string {
  const query = new URLSearchParams(params);
  query.delete("kind");
  query.delete("item");
  query.delete("all");
  const head = new URLSearchParams({ kind, item: itemKey });
  const rest = query.toString();
  return `/reports/access-by-application/holders?${head}${rest ? `&${rest}` : ""}`;
}

/** The raw row from report_access_by_item(). */
export type RawAccessItem = {
  item_key: string;
  name: string;
  category_name: string | null;
  holders: number;
  total_people: number;
  total_rights: number;
  items_in_use: number;
  catalog_count: number;
  leaving_people: number;
};

export type AccessItem = {
  key: string;
  name: string;
  category: string | null;
  holders: number;
};

export type AccessTotals = {
  people: number;
  rights: number;
  inUse: number;
  catalog: number;
  leaving: number;
};

export function accessItems(rows: RawAccessItem[]): AccessItem[] {
  return rows.map((r) => ({
    key: r.item_key,
    name: r.name,
    category: r.category_name,
    holders: r.holders,
  }));
}

export function accessTotals(rows: RawAccessItem[]): AccessTotals {
  const r = rows[0];
  return {
    people: Number(r?.total_people ?? 0),
    rights: Number(r?.total_rights ?? 0),
    inUse: Number(r?.items_in_use ?? 0),
    catalog: Number(r?.catalog_count ?? 0),
    leaving: Number(r?.leaving_people ?? 0),
  };
}

/** The raw row from report_access_holders(). */
export type RawAccessHolder = {
  inventory_id: string;
  item_key: string;
  name: string;
  category_name: string | null;
  permission: string | null;
  description: string | null;
  asset_tag: string | null;
  source: string;
  granted_at: string;
  granted_request_id: string | null;
  granted_ticket_id: string | null;
  first_name: string | null;
  last_name: string | null;
  work_email: string;
  department: string | null;
  country: string | null;
  leaving_request_id: string | null;
  leaving_ticket_id: string | null;
};

/** One person holding an item (board: … · one app (who holds it)). */
export type AccessHolder = {
  id: string;
  name: string;
  /** "anna.keller@laine.ai · Engineering". */
  subtitle: string;
  /** Permission, asset tag or scope — "—" when none. */
  detail: string;
  /** "15 Oct 2026". */
  since: string;
  /** "UAM-2026-000141", or "Excel import". */
  grantedBy: string;
  grantedHref: string | null;
  leaving: { ticketId: string; href: string | null } | null;
};

export function accessHolder(
  r: RawAccessHolder,
  kind: AccessKind,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
): AccessHolder {
  const detail =
    (kind === "equipment" ? r.asset_tag || r.description : r.permission) || "—";
  const leavingHref = r.leaving_request_id
    ? options.canOpenRequests
      ? `/requests/${r.leaving_request_id}`
      : options.isApprover
        ? `/approvals/${r.leaving_request_id}`
        : null
    : null;
  return {
    id: r.inventory_id,
    name: personName(r.first_name, r.last_name) || r.work_email,
    subtitle: [r.work_email, r.department, r.country && countryName(r.country)]
      .filter(Boolean)
      .join(" · "),
    detail,
    since: formatDay(r.granted_at, options.timeZone),
    grantedBy:
      r.granted_ticket_id ?? (r.source === "import" ? "Excel import" : "—"),
    grantedHref: r.granted_request_id
      ? `/records/${r.granted_request_id}`
      : null,
    leaving:
      r.leaving_request_id && r.leaving_ticket_id
        ? { ticketId: r.leaving_ticket_id, href: leavingHref }
        : null,
  };
}

/** Holders per permission as bars, most first ("" = no permission). */
export function permissionBars(counts: unknown): GroupRow[] {
  const entries = Object.entries(
    counts && typeof counts === "object"
      ? (counts as Record<string, number>)
      : {},
  ).map(([permission, n]) => ({
    label: permission || "No permission",
    n: Number(n),
  }));
  const total = entries.reduce((s, e) => s + e.n, 0);
  return entries
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .map((e) => ({
      key: e.label,
      label: e.label,
      onboarded: e.n,
      share: total ? `${Math.round((e.n / total) * 100)}%` : "0%",
    }));
}

/**
 * "access-by-application_applications_2026-10-20.csv", or for one item
 * "access-by-application_google-workspace_2026-10-20.pdf".
 */
export function accessFileName(
  kind: AccessKind,
  itemName: string | null,
  day: string,
  ext: "csv" | "pdf",
): string {
  const slug = (itemName ?? ACCESS_KIND_INFO[kind].tab)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `access-by-application_${slug || "item"}_${day}.${ext}`;
}
