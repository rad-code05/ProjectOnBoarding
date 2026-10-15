import { describeEvent, type RawAuditEvent } from "./describe";

/** One step on a request's timeline (board: Request activity). */
export type ActivityEntry = {
  id: number;
  at: string;
  who: string;
  what: string;
  /** "section 5", "fingerprint 5d20a9e1…" — shown after the time. */
  context: string | null;
  /** A note for the approver or a return comment, quoted. */
  note: string | null;
  /** key = signed / confirmed (black dot); return = returned (red ring). */
  dot: "key" | "return" | "step";
};

type ActivityRow = RawAuditEvent & {
  id: number;
  created_at: string;
  note: string | null;
};

/**
 * A request's activity in plain words, newest first. State changes that
 * only repeat a signature, return or confirmation are left out.
 */
export function activityEntries(rows: ActivityRow[]): ActivityEntry[] {
  const signs = rows
    .filter((r) => r.action === "request.signed")
    .map((r) => r.id)
    .sort((a, b) => a - b);
  return rows
    .filter((r) => {
      if (r.action !== "request.state_changed") return true;
      const to = (r.diff as { to?: string } | null)?.to;
      return !["pending_confirmation", "returned", "closed"].includes(to ?? "");
    })
    .map((r) => {
      const text = describeEvent(r, { ref: null });
      const again = r.action === "request.signed" && signs[0] !== r.id;
      const note = r.note?.trim() || null;
      return {
        id: r.id,
        at: r.created_at,
        who: text.who,
        what: again ? "signed again (Review & sign)" : text.what,
        context: text.context,
        note: note
          ? r.action === "request.signed"
            ? `Note for the approver: “${note}”`
            : `“${note}”`
          : null,
        dot:
          r.action === "request.signed" || r.action === "request.confirmed"
            ? "key"
            : r.action === "request.returned"
              ? "return"
              : "step",
      };
    });
}
