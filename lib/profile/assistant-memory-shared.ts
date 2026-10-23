import { TYPE_LABELS, type RequestType } from "@/lib/requests/labels";

/**
 * The request types someone starts most, most first (ties in the usual
 * order): ["Onboarding", "Offboarding"]. Types they never started are left out.
 */
export function topRequestTypes(types: readonly RequestType[]): string[] {
  const order = Object.keys(TYPE_LABELS) as RequestType[];
  const count = new Map<RequestType, number>();
  for (const t of types) count.set(t, (count.get(t) ?? 0) + 1);
  return order
    .filter((t) => count.has(t))
    .sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0))
    .map((t) => TYPE_LABELS[t]);
}
