import * as z from "zod";

/** Section 6 type (Laptop · macOS …), with its own actions. */
export type EquipmentType = {
  id: number;
  name: string;
  actions: string[];
  /** "Other" — the item must say what it is. */
  needsDescription: boolean;
};

/** One piece of equipment on a request (several allowed). */
export type EquipmentItem = {
  id: string;
  typeId: number;
  typeName: string;
  action: string;
  description: string | null;
  assetTag: string | null;
  notes: string | null;
};

/** Section 7 type (Office access …), with its own actions and scopes. */
export type PhysicalType = {
  id: number;
  name: string;
  actions: string[];
  scopes: string[];
};

/** What a request says about one section 7 type. */
export type PhysicalChoice = {
  action: string;
  scope: string | null;
  notes: string | null;
};

/** Type id → choice; types without a row are "not set". */
export type PhysicalChoices = Record<number, PhysicalChoice>;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

export const saveEquipmentSchema = z.object({
  requestId: z.uuid(),
  /** null = add a new item. */
  itemId: z.uuid().nullable(),
  typeId: z.int().positive(),
  action: z.string().trim().min(1).max(40),
  description: optional(120),
  assetTag: optional(80),
  notes: optional(500),
});

export const setPhysicalSchema = z.object({
  requestId: z.uuid(),
  typeId: z.int().positive(),
  action: z.string().trim().min(1).max(40),
  scope: optional(80),
  notes: optional(500),
});

/** "Asset LN-0042 · 14" MacBook Pro" — the second line of an item row. */
export function equipmentDetail(item: EquipmentItem): string {
  return (
    [item.assetTag && `Asset ${item.assetTag}`, item.description]
      .filter(Boolean)
      .join(" · ") || "No asset tag yet"
  );
}
