import * as z from "zod";

/** Sections Moises can flag when he returns a request (board: Return to Raju). */
export const FLAGGABLE_SECTIONS = [
  { number: 2, label: "2 · Employee details" },
  { number: 5, label: "5 · Application access" },
  { number: 6, label: "6 · IT equipment" },
  { number: 7, label: "7 · Physical & logical access" },
  { number: 9, label: "9 · IT execution confirmation" },
] as const;

export const confirmSchema = z.object({
  requestId: z.uuid(),
  snapshot: z.record(z.string(), z.unknown()),
});

export const returnSchema = z.object({
  requestId: z.uuid(),
  comment: z
    .string()
    .trim()
    .min(1, "Say what needs fixing.")
    .max(1000, "Keep the comment under 1000 characters."),
  sections: z.array(
    z
      .number()
      .int()
      .refine((n) => FLAGGABLE_SECTIONS.some((s) => s.number === n)),
  ),
});

export type ApprovalResult = { ok: true } | { ok: false; message: string };

/** Database refusals of confirm_request() / return_request() → plain words. */
export function approvalErrorMessage(
  code: string | undefined,
  message: string | undefined,
): string {
  if (code === "40001") {
    return "This request changed while you were reviewing it. Close this and review it again.";
  }
  if (code === "42501") {
    return message?.includes("own request")
      ? "You prepared this request — another approver must confirm it."
      : "Only an approver can do this.";
  }
  if (code === "23514" && message) {
    if (message.includes("signature or initials")) {
      return "Add your signature or initials in My profile first.";
    }
    if (message.includes("not awaiting confirmation")) {
      return "This request was already confirmed or returned.";
    }
    if (message.includes("needs fixing")) return "Say what needs fixing.";
  }
  return "Could not save. Check your connection and try again.";
}
