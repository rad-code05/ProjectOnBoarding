import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { searchTerms, type RequestFilters } from "./filters";
import type { RequestState } from "./labels";

export type RequestRow = {
  id: string;
  ticket_id: string;
  type: "onboarding" | "offboarding" | "access_modification";
  state: RequestState;
  first_name: string | null;
  last_name: string | null;
  work_email: string | null;
  country: string | null;
  effective_date: string | null;
  updated_at: string;
  assignee: { first_name: string | null; last_name: string | null } | null;
};

/**
 * The requests list for the signed-in user. Runs with their own session, so
 * Row Level Security decides what is visible (approvers never get drafts).
 */
export async function listRequests(filters: RequestFilters) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("requests")
    .select(
      "id, ticket_id, type, state, first_name, last_name, work_email, country, effective_date, updated_at, assignee:app_users!requests_assignee_id_fkey(first_name, last_name)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .limit(filters.limit);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("state", filters.status);
  if (filters.country) query = query.eq("country", filters.country);
  // Every word must match a name, the work email or the ticket ID.
  for (const term of searchTerms(filters.q)) {
    query = query.or(
      ["first_name", "last_name", "work_email", "ticket_id"]
        .map((column) => `${column}.ilike.*${term}*`)
        .join(","),
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Could not load requests: ${error.message}`);
  return { rows: data as RequestRow[], total: count ?? 0 };
}

/**
 * Numbers for the summary tiles, the total (for the empty state) and the
 * countries in use (the country filter) — from ONE query, because every
 * round trip to the database adds up on a slow connection.
 */
export async function requestSummary() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("requests")
    .select("state, country");
  if (error) throw new Error(`Could not load the summary: ${error.message}`);
  const count = (state: RequestState) =>
    data.filter((row) => row.state === state).length;
  return {
    total: data.length,
    draft: count("draft"),
    inExecution: count("in_execution"),
    awaitingConfirmation: count("pending_confirmation"),
    countries: [
      ...new Set(data.flatMap((row) => (row.country ? [row.country] : []))),
    ].sort(),
  };
}
