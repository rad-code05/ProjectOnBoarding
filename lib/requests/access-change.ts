import * as z from "zod";
import { splitRoles } from "./access";

/**
 * Access change (F10, board Phone · Access change draft): what the person
 * holds today, each with this request's change — or none, which means
 * "keep". Shared by the server and the screens; the database has the last
 * word (20261014130000_access_modification_request.sql).
 */
export type HeldKind = "application" | "equipment" | "access";

/** This request's line about one held item. */
export type HeldChange = {
  itemId: string;
  action: string;
  /** New permission (app) or scope (access); for a removal what they had. */
  value: string | null;
  notes: string | null;
};

export type HeldItem = {
  inventoryId: string;
  kind: HeldKind;
  /** The catalog app / equipment type / access type (null: an "Other" app). */
  catalogId: number | null;
  name: string;
  category: string | null;
  /** What they have today: permission (app) or scope (access). */
  current: string | null;
  assetTag: string | null;
  description: string | null;
  /** The request that granted it, e.g. UAM-2026-000101. */
  grantedTicket: string | null;
  grantedAt: string;
  /** Options a change may pick (permissions or scopes); empty for devices. */
  options: string[];
  /** Several roles at once (Google Cloud). */
  multiple: boolean;
  /** Action for "Change", or null when the item can't be changed (devices). */
  changeAction: string | null;
  /** Action for "Remove": Remove, Disable or Return. */
  removeAction: string;
  change: HeldChange | null;
};

export type HeldChoice = "keep" | "change" | "remove";

const REMOVE_ACTIONS = ["Remove", "Disable", "Return"];

export function heldChoice(item: Pick<HeldItem, "change">): HeldChoice {
  if (!item.change) return "keep";
  return REMOVE_ACTIONS.includes(item.change.action) ? "remove" : "change";
}

/** Right-hand text of a row: "Editor → Admin", "Will be removed", or today's value. */
export function heldLabel(item: HeldItem): string {
  const choice = heldChoice(item);
  if (choice === "remove") {
    return item.kind === "equipment" ? "To return" : "Will be removed";
  }
  if (choice === "change") {
    return `${item.current ?? "—"} → ${item.change?.value ?? "—"}`;
  }
  if (item.kind === "equipment") return item.assetTag ?? item.description ?? "";
  return item.current ?? "";
}

/** "1 changed · 1 removed · 7 kept" counts for a list. */
export function heldSummary(items: HeldItem[]): Record<HeldChoice, number> {
  const counts: Record<HeldChoice, number> = { keep: 0, change: 0, remove: 0 };
  for (const item of items) counts[heldChoice(item)] += 1;
  return counts;
}

/** A change must pick something different from what they have. */
export function isSameAsToday(item: HeldItem, value: string | null): boolean {
  const today = splitRoles(item.current).sort().join("; ");
  return splitRoles(value).sort().join("; ") === today;
}

// ---------------------------------------------------------------------------
// Building the list (pure: the loader passes the rows it read)
// ---------------------------------------------------------------------------
type InventoryRow = {
  id: string;
  kind: HeldKind;
  app_id: number | null;
  equipment_type_id: number | null;
  access_type_id: number | null;
  name: string;
  category_name: string | null;
  permission: string | null;
  asset_tag: string | null;
  description: string | null;
  granted_at: string;
  granted_ticket: string | null;
};
type CatalogInfo = {
  actions: string[];
  permissions: string[];
  multiple: boolean;
};
type AccessTypeInfo = { actions: string[]; scopes: string[] };
type LinkedLine = {
  id: string;
  inventory_id: string | null;
  action: string;
  value: string | null;
  notes: string | null;
};

const KIND_ORDER: HeldKind[] = ["application", "equipment", "access"];

export function buildHeld(input: {
  inventory: InventoryRow[];
  apps: Map<number, CatalogInfo>;
  accessTypes: Map<number, AccessTypeInfo>;
  lines: LinkedLine[];
}): HeldItem[] {
  const byInventory = new Map(
    input.lines
      .filter((line) => line.inventory_id)
      .map((line) => [line.inventory_id as string, line]),
  );
  return input.inventory
    .map((row): HeldItem => {
      const line = byInventory.get(row.id);
      const base = {
        inventoryId: row.id,
        kind: row.kind,
        catalogId:
          row.kind === "application"
            ? row.app_id
            : row.kind === "equipment"
              ? row.equipment_type_id
              : row.access_type_id,
        name: row.name,
        category: row.category_name,
        current: row.permission,
        assetTag: row.asset_tag,
        description: row.description,
        grantedTicket: row.granted_ticket,
        grantedAt: row.granted_at,
        change: line
          ? {
              itemId: line.id,
              action: line.action,
              value: line.value,
              notes: line.notes,
            }
          : null,
      };
      if (row.kind === "application") {
        // An "Other" app (no catalog row) takes any typed permission.
        const app = row.app_id === null ? null : input.apps.get(row.app_id);
        const holds = (app?.actions ?? ["Grant", "Modify"]).filter((a) =>
          ["Modify", "Grant", "Enroll"].includes(a),
        );
        return {
          ...base,
          options: app?.permissions ?? [],
          multiple: app?.multiple ?? false,
          changeAction: holds.includes("Modify")
            ? "Modify"
            : (holds[0] ?? null),
          removeAction: "Remove",
        };
      }
      if (row.kind === "access") {
        const type =
          row.access_type_id === null
            ? null
            : input.accessTypes.get(row.access_type_id);
        const actions = type?.actions ?? [];
        return {
          ...base,
          options: type?.scopes ?? [],
          multiple: false,
          changeAction: actions.includes("Modify")
            ? "Modify"
            : actions.includes("Grant") && (type?.scopes.length ?? 0) > 1
              ? "Grant"
              : null,
          removeAction: actions.includes("Disable") ? "Disable" : "Remove",
        };
      }
      return {
        ...base,
        options: [],
        multiple: false,
        changeAction: null,
        removeAction: "Return",
      };
    })
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (a.category ?? "").localeCompare(b.category ?? "") ||
        a.name.localeCompare(b.name),
    );
}

// ---------------------------------------------------------------------------
// Server action inputs
// ---------------------------------------------------------------------------
export const heldChangeSchema = z.object({
  requestId: z.uuid(),
  kind: z.enum(["application", "equipment", "access"]),
  inventoryId: z.uuid(),
  action: z.string().trim().min(1).max(40),
  value: z
    .string()
    .trim()
    .max(600)
    .nullable()
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .max(500, "Keep notes under 500 characters.")
    .nullable()
    .transform((v) => v || null),
});

export const keepHeldSchema = z.object({
  requestId: z.uuid(),
  kind: z.enum(["application", "equipment", "access"]),
  inventoryId: z.uuid(),
});

/** Section 2 as it was on the person's previous closed request ("Was: …"). */
export type PreviousDetails = {
  ticketId: string;
  job_title: string | null;
  department_id: number | null;
  department: string | null;
  country: string | null;
  manager_name: string | null;
  requestor_name: string | null;
};
