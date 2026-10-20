import { formatDayTime } from "@/lib/requests/format";
import {
  personName,
  type RequestState,
  type RequestType,
} from "@/lib/requests/labels";

/** One request in the Signature log (board: Phone · Signature log). */
export type SignatureRow = {
  id: string;
  ticketId: string;
  type: RequestType;
  state: RequestState;
  name: string;
  /** "15 Oct 2026, 11:02 · Raju Bholani" — the first Review & sign. */
  itSigned: string;
  /** "15 Oct 2026, 16:05 · Moises Larez" or "Not yet — waiting 1d 6h". */
  approved: string;
  /** "5h 3m · returned once" or "—". */
  timeToApprove: string;
  /** "Made 15 Oct 2026, 16:05", "Made at approval" or "—". */
  pdf: string;
  href: string | null;
};

/** The raw row from report_signature_log() this module reads. */
export type RawSignatureRow = {
  id: string;
  ticket_id: string;
  type: RequestType;
  state: RequestState;
  first_name: string | null;
  last_name: string | null;
  first_signed_at: string;
  first_signed_by: string | null;
  last_signed_at: string;
  approved_at: string | null;
  approved_by: string | null;
  returns: number;
  last_returned_at: string | null;
  pdf_generated_at: string | null;
};

/**
 * A duration in words, two units at most: "2d 4h", "5h 3m", "12m",
 * "< 1m".
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (m) return `${m}m`;
  return "< 1m";
}

/** "returned once", "returned twice", "returned 3 times". */
export function returnsText(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "returned once";
  if (n === 2) return "returned twice";
  return `returned ${n} times`;
}

const seconds = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 1000;

/**
 * A signature-log row in plain words (company timezone). Time to approve
 * runs from the FIRST Review & sign to the confirmation (decided
 * 2026-10-20); an open request says how long it has been waiting since its
 * last Review & sign, or when it was returned.
 */
export function signatureRow(
  r: RawSignatureRow,
  options: {
    timeZone: string;
    now?: Date;
    canOpenRequests: boolean;
    isApprover: boolean;
  },
): SignatureRow {
  const now = (options.now ?? new Date()).toISOString();
  const at = (iso: string) => formatDayTime(iso, options.timeZone);
  const who = (name: string | null) => (name ? ` · ${name}` : "");
  let approved: string;
  if (r.approved_at) {
    approved = `${at(r.approved_at)}${who(r.approved_by)}`;
  } else if (r.state === "returned" && r.last_returned_at) {
    approved = `Not yet — returned ${at(r.last_returned_at)}`;
  } else {
    approved = `Not yet — waiting ${formatDuration(seconds(r.last_signed_at, now))}`;
  }
  const time = r.approved_at
    ? [
        formatDuration(seconds(r.first_signed_at, r.approved_at)),
        returnsText(r.returns),
      ]
        .filter(Boolean)
        .join(" · ")
    : r.returns
      ? returnsText(r.returns).replace(/^r/, "R")
      : "—";
  return {
    id: r.id,
    ticketId: r.ticket_id,
    type: r.type,
    state: r.state,
    name: personName(r.first_name, r.last_name) || "Unnamed person",
    itSigned: `${at(r.first_signed_at)}${who(r.first_signed_by)}`,
    approved,
    timeToApprove: time,
    pdf: r.pdf_generated_at
      ? `Made ${at(r.pdf_generated_at)}`
      : r.state === "closed"
        ? "—"
        : "Made at approval",
    href:
      r.state === "closed"
        ? `/records/${r.id}`
        : options.canOpenRequests
          ? `/requests/${r.id}`
          : options.isApprover
            ? `/approvals/${r.id}`
            : null,
  };
}
