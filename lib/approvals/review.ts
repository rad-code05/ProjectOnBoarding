import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { loadSignatures, SIGNATURE_BUCKET } from "@/lib/profile/signatures";
import type { ChecklistItem } from "@/lib/requests/execution";
import { formatDay, formatTime } from "@/lib/requests/format";
import type { RequestState, RequestType } from "@/lib/requests/labels";
import type { SignerSignature } from "@/lib/requests/signing";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** A signature applied to the request, as the approver sees it. */
export type AppliedSignature = {
  name: string;
  /** "9 Oct 2026, 14:12" — server time. */
  signedLabel: string;
  imageUrl: string | null;
  typedText: string | null;
  /** SHA-256 of what was signed. */
  fingerprint: string;
  /** Raju's note for the approver after a return. */
  note: string | null;
};

export type ApprovalReview = {
  id: string;
  ticketId: string;
  type: RequestType;
  state: RequestState;
  /** Exactly what the approver confirms — sent back unchanged. */
  snapshot: Json;
  checklist: ChecklistItem[];
  it: AppliedSignature | null;
  approval: AppliedSignature | null;
  /** The approver's own active signature (null = add one in My profile). */
  mine: SignerSignature | null;
  /** Created or executed it: another approver must confirm. */
  ownRequest: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One request for the approver: the snapshot they would confirm, the
 * signatures already applied (with their images through the "visible where
 * applied" rule) and their own active signature. null = not visible.
 */
export async function loadApprovalReview(
  id: string,
): Promise<ApprovalReview | null> {
  if (!UUID.test(id)) return null;
  const { userId } = await getCurrentUser();
  const supabase = createServerSupabaseClient();

  const { data: request } = await supabase
    .from("requests")
    .select("id, ticket_id, type, state, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!request) return null;

  const [preview, marks, checklist, execution, signatures] = await Promise.all([
    supabase.rpc("approval_preview", { p_request_id: id }),
    supabase.rpc("request_signature_marks", { p_request_id: id }),
    supabase
      .from("execution_checklist_items")
      .select("key, label")
      .contains("applies_to", [request.type])
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("execution_confirmations")
      .select("executed_by")
      .eq("request_id", id)
      .maybeSingle(),
    loadSignatures(),
  ]);
  if (preview.error || !preview.data) return null;

  const rows = marks.data ?? [];
  const paths = rows.flatMap((m) => (m.storage_path ? [m.storage_path] : []));
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const signed = await supabase.storage
      .from(SIGNATURE_BUCKET)
      .createSignedUrls(paths, 10 * 60);
    for (const item of signed.data ?? []) {
      if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
    }
  }
  const applied = (section: string): AppliedSignature | null => {
    const m = rows.find((row) => row.section === section);
    if (!m) return null;
    return {
      name: m.signer_name ?? "—",
      signedLabel: `${formatDay(m.signed_at)}, ${formatTime(m.signed_at)}`,
      imageUrl: m.storage_path ? (links.get(m.storage_path) ?? null) : null,
      typedText: m.typed_text,
      fingerprint: m.sha256,
      note: m.note,
    };
  };

  const active = signatures.versions.find((v) => v.status === "active");
  return {
    id: request.id,
    ticketId: request.ticket_id,
    type: request.type,
    state: request.state,
    snapshot: preview.data,
    checklist: checklist.data ?? [],
    it: applied("it_execution"),
    approval: applied("final_confirmation"),
    mine: active
      ? {
          kind: active.kind,
          source: active.source,
          typedText: active.typedText,
          previewUrl: active.previewUrl,
          detail: active.detail,
        }
      : null,
    ownRequest:
      userId === request.created_by || userId === execution.data?.executed_by,
  };
}
