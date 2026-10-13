import type { RequestType } from "./labels";

/**
 * Which actions each request type offers (Raju, 2026-10-13). The database
 * enforces the same (migration 20261013150000_actions_by_type.sql).
 * null = everything the catalog item offers (access modification, F10).
 */
const ALLOWED: Record<
  RequestType,
  Record<"app" | "equipment" | "access", string[] | null>
> = {
  onboarding: {
    app: ["Grant", "Enroll"],
    equipment: ["Issue"],
    access: ["Grant"],
  },
  offboarding: {
    app: ["Remove"],
    equipment: ["Return"],
    access: ["Disable", "Remove"],
  },
  access_modification: { app: null, equipment: null, access: null },
};

/**
 * The actions to offer for a catalog item on this type of request, in the
 * item's own order. `current` (what a row already has) stays in the list so
 * an older row still shows its value until it is changed.
 */
export function allowedActions(
  type: RequestType,
  kind: "app" | "equipment" | "access",
  actions: string[],
  current?: string | null,
): string[] {
  const allowed = ALLOWED[type][kind];
  if (!allowed) return actions;
  return actions.filter((a) => allowed.includes(a) || a === current);
}
