import "server-only";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import type { DatasetKey, Row } from "./datasets";
import {
  accessRows,
  peopleRows,
  personIndex,
  requestRows,
  signatureRows,
  slaRows,
} from "./rows";

/** The most rows read from one report function (its own cap is 10,000). */
export const MAX_SOURCE_ROWS = 10000;

/**
 * Reads the data sets a custom report uses — and only those — through the
 * existing report functions with the reader's own session: the database
 * checks the reader role and RLS decides the rows, exactly as on the
 * Reports page. Each source is read at most once per report.
 */
export async function loadDatasets(
  keys: Iterable<DatasetKey>,
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<Map<DatasetKey, Row[]>> {
  const want = new Set(keys);
  const all = { p_limit: MAX_SOURCE_ROWS };
  const call = async <T>(
    promise: PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>,
  ) => {
    const { data, error } = await promise;
    if (error) throw new Error(`Could not load the report: ${error.message}`);
    return data ?? [];
  };

  // People (with what they hold) are needed by most sets; requests place
  // the people who have left.
  const needPeople = want.size > 0;
  const needRequests =
    want.has("requests") ||
    want.has("signatures") ||
    want.has("offboarding_sla");
  const [employees, held, requests, signatures, sla] = await Promise.all([
    needPeople ? call(supabase.rpc("report_employees", all)) : [],
    needPeople ? call(supabase.rpc("report_access_held", all)) : [],
    needRequests ? call(supabase.rpc("report_all_users", all)) : [],
    want.has("signatures")
      ? call(supabase.rpc("report_signature_log", all))
      : [],
    want.has("offboarding_sla")
      ? call(supabase.rpc("report_offboarding_sla", all))
      : [],
  ]);

  const people = peopleRows(employees, held);
  const reqRows = requestRows(requests);
  const persons = personIndex(people.byEmail, reqRows);
  const out = new Map<DatasetKey, Row[]>();
  if (want.has("people")) out.set("people", people.rows);
  if (want.has("access"))
    out.set("access", accessRows(held, people.byEmployee));
  if (want.has("requests")) out.set("requests", reqRows);
  if (want.has("signatures"))
    out.set("signatures", signatureRows(signatures, persons));
  if (want.has("offboarding_sla"))
    out.set("offboarding_sla", slaRows(sla, persons));
  return out;
}
