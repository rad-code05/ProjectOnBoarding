import type { ReactNode } from "react";
import { NoMatchingRequests, NoRequestsYet } from "./EmptyRequests";

/** Shows the list, or the right empty state instead of an empty table. */
export function EmptyRequestsSwitch({
  nothingYet,
  noMatch,
  children,
}: {
  nothingYet: boolean;
  noMatch: boolean;
  children: ReactNode;
}) {
  if (nothingYet) return <NoRequestsYet />;
  if (noMatch) return <NoMatchingRequests />;
  return <>{children}</>;
}
