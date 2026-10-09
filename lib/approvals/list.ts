import "server-only";
import { formatDate, formatDay, formatTime } from "@/lib/requests/format";
import { TYPE_LABELS, countryName, personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { accessSummary, monthStart } from "./summary";

/** One request waiting for the approver (a card on Approvals). */
export type WaitingRequest = {
  id: string;
  ticketId: string;
  name: string;
  /** "Product Designer · Switzerland". */
  role: string;
  type: string;
  effective: string;
  /** "Figma, Slack, Google Workspace +2". */
  access: string;
  /** "Raju Bholani · 9 Oct, 14:12". */
  signedByIt: string;
};

export type ClosedRequest = {
  id: string;
  ticketId: string;
  name: string;
  closed: string;
};

export type ApprovalsOverview = {
  waiting: WaitingRequest[];
  returnedCount: number;
  closedThisMonth: number;
  recentlyClosed: ClosedRequest[];
};

/** How many requests wait for an approver (the menu badge). RLS decides. */
export async function countWaiting(): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("state", "pending_confirmation");
  return count ?? 0;
}

/**
 * The approver's landing page: what waits for them, what went back to Raju,
 * what closed recently. Read with their own session (RLS: approvers only see
 * awaiting, returned and closed requests).
 */
export async function loadApprovals(): Promise<ApprovalsOverview> {
  const supabase = createServerSupabaseClient();
  const [waiting, returned, closedMonth, closed] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, ticket_id, type, first_name, last_name, job_title, country, effective_date, request_access_items(app_name, created_at)",
      )
      .eq("state", "pending_confirmation")
      .order("state_changed_at", { ascending: true }),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("state", "returned"),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("state", "closed")
      .gte("closed_at", monthStart()),
    supabase
      .from("requests")
      .select("id, ticket_id, first_name, last_name, closed_at")
      .eq("state", "closed")
      .order("closed_at", { ascending: false })
      .limit(5),
  ]);
  for (const result of [waiting, returned, closedMonth, closed]) {
    if (result.error) {
      throw new Error(`Could not load approvals: ${result.error.message}`);
    }
  }

  // Who signed section 9, per request (the signer's name is only readable
  // through the request it was applied to).
  const marks = await Promise.all(
    (waiting.data ?? []).map((r) =>
      supabase.rpc("request_signature_marks", { p_request_id: r.id }),
    ),
  );

  return {
    waiting: (waiting.data ?? []).map((r, i) => {
      const it = marks[i].data?.find((m) => m.section === "it_execution");
      const apps = [...r.request_access_items]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => a.app_name);
      return {
        id: r.id,
        ticketId: r.ticket_id,
        name: personName(r.first_name, r.last_name) || "Unnamed person",
        role: [r.job_title, r.country ? countryName(r.country) : null]
          .filter(Boolean)
          .join(" · "),
        type: TYPE_LABELS[r.type],
        effective: formatDate(r.effective_date),
        access: accessSummary(apps),
        signedByIt: it
          ? `${it.signer_name ?? "IT"} · ${formatDay(it.signed_at)}, ${formatTime(it.signed_at)}`
          : "—",
      };
    }),
    returnedCount: returned.count ?? 0,
    closedThisMonth: closedMonth.count ?? 0,
    recentlyClosed: (closed.data ?? []).map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      name: personName(r.first_name, r.last_name) || "Unnamed person",
      closed: formatDay(r.closed_at),
    })),
  };
}
