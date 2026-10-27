/**
 * The robot's badge (F16c-2, design: "badge with pending suggestions"): how
 * many of the assistant's suggestions wait on the request open right now.
 * The request form sets it; the robot button reads it (a tiny shared store
 * for useSyncExternalStore — both live in the same page).
 */
let waiting = 0;
const listeners = new Set<() => void>();

export function setWaitingSuggestions(count: number): void {
  if (count === waiting) return;
  waiting = count;
  for (const listener of listeners) listener();
}

export function subscribeWaitingSuggestions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const readWaitingSuggestions = (): number => waiting;
