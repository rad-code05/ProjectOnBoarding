import "server-only";
import {
  loadAppliedSignatures,
  type AppliedSignature,
} from "@/lib/approvals/review";
import type { ChecklistItem } from "@/lib/requests/execution";
import { formatDayTime } from "@/lib/requests/format";
import type { RequestType } from "@/lib/requests/labels";
import { snapshotSchema, type Snapshot } from "@/lib/requests/signing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";
import { ensureRecordPdf, type PdfRecord } from "./ensure";

/** Everything the record page shows (board: Phone · Closed request). */
export type RecordPage = {
  id: string;
  ticketId: string;
  type: RequestType;
  /** "9 Oct 2026, 16:05" — server time, company timezone. */
  closedLabel: string;
  /** The approval snapshot — what was confirmed. */
  snapshot: Snapshot;
  checklist: ChecklistItem[];
  it: AppliedSignature | null;
  approval: AppliedSignature | null;
  /** The viewer's screen timezone (F05e). */
  timezone: string;
  /** null = the PDF could not be made just now (try again). */
  pdf: (PdfRecord & { generatedLabel: string }) | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A closed request as a read-only record, with its PDF (made now if closing
 * couldn't). null = unknown, not closed, or not visible to the caller.
 */
export async function loadRecordPage(id: string): Promise<RecordPage | null> {
  if (!UUID.test(id)) return null;
  const supabase = createServerSupabaseClient();
  // Asked in parallel with the queries below (one round trip less).
  const tzPromise = displayTimezone();
  const { data: request } = await supabase
    .from("requests")
    .select("id, ticket_id, type, state, closed_at")
    .eq("id", id)
    .maybeSingle();
  if (!request || request.state !== "closed" || !request.closed_at) {
    return null;
  }

  const [approval, applied, checklist] = await Promise.all([
    supabase
      .from("approvals")
      .select("snapshot:request_snapshots!approvals_snapshot_id_fkey(data)")
      .eq("request_id", id)
      .eq("decision", "confirmed")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    tzPromise.then((tz) => loadAppliedSignatures(supabase, id, tz)),
    supabase
      .from("execution_checklist_items")
      .select("key, label")
      .contains("applies_to", [request.type])
      .eq("active", true)
      .order("sort_order"),
  ]);
  const parsed = snapshotSchema.safeParse(approval.data?.snapshot?.data);
  const tz = await tzPromise;
  if (!parsed.success) return null;

  let pdf: RecordPage["pdf"] = null;
  try {
    const record = await ensureRecordPdf(id);
    if (record)
      pdf = {
        ...record,
        generatedLabel: formatDayTime(record.generatedAt, record.timezone),
      };
  } catch (cause) {
    console.error("PDF record not available", cause);
  }

  return {
    id: request.id,
    ticketId: request.ticket_id,
    type: request.type,
    closedLabel: formatDayTime(request.closed_at, tz),
    timezone: tz,
    snapshot: parsed.data,
    checklist: checklist.data ?? [],
    it: applied.it,
    approval: applied.approval,
    pdf,
  };
}
