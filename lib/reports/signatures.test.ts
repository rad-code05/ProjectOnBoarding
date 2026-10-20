import { describe, expect, test } from "vitest";
import {
  formatDuration,
  returnsText,
  signatureRow,
  type RawSignatureRow,
} from "./signatures";

const base: RawSignatureRow = {
  id: "r1",
  ticket_id: "UAM-2026-000141",
  type: "access_modification",
  state: "closed",
  first_name: "Anna",
  last_name: "Keller",
  first_signed_at: "2026-10-15T07:02:00Z", // 11:02 in Dubai
  first_signed_by: "Raju Bholani",
  last_signed_at: "2026-10-15T10:12:00Z",
  approved_at: "2026-10-15T12:05:00Z",
  approved_by: "Moises Larez",
  returns: 1,
  last_returned_at: "2026-10-15T07:30:00Z",
  pdf_generated_at: "2026-10-15T12:05:00Z",
};
const opts = {
  timeZone: "Asia/Dubai",
  canOpenRequests: true,
  isApprover: false,
};

describe("formatDuration", () => {
  test("two units at most", () => {
    expect(formatDuration(30)).toBe("< 1m");
    expect(formatDuration(12 * 60)).toBe("12m");
    expect(formatDuration(5 * 3600 + 3 * 60)).toBe("5h 3m");
    expect(formatDuration(3 * 3600)).toBe("3h");
    expect(formatDuration(28 * 3600 + 59 * 60)).toBe("1d 4h");
    expect(formatDuration(2 * 86400)).toBe("2d");
  });

  test("returns in words", () => {
    expect(returnsText(0)).toBe("");
    expect(returnsText(1)).toBe("returned once");
    expect(returnsText(2)).toBe("returned twice");
    expect(returnsText(4)).toBe("returned 4 times");
  });
});

describe("signatureRow — board: Phone · Signature log", () => {
  test("approved: from the FIRST Review & sign, returns included", () => {
    expect(signatureRow(base, opts)).toMatchObject({
      name: "Anna Keller",
      itSigned: "15 Oct 2026, 11:02 · Raju Bholani",
      approved: "15 Oct 2026, 16:05 · Moises Larez",
      timeToApprove: "5h 3m · returned once",
      pdf: "Made 15 Oct 2026, 16:05",
      href: "/records/r1",
    });
  });

  test("awaiting confirmation: how long since the last Review & sign", () => {
    const row = signatureRow(
      {
        ...base,
        state: "pending_confirmation",
        approved_at: null,
        approved_by: null,
        returns: 0,
        pdf_generated_at: null,
      },
      { ...opts, now: new Date("2026-10-16T16:12:00Z") },
    );
    expect(row).toMatchObject({
      approved: "Not yet — waiting 1d 6h",
      timeToApprove: "—",
      pdf: "Made at approval",
      href: "/requests/r1",
    });
  });

  test("returned: when, and the count; approvers open it on Approvals", () => {
    const row = signatureRow(
      {
        ...base,
        state: "returned",
        approved_at: null,
        approved_by: null,
        pdf_generated_at: null,
      },
      { ...opts, canOpenRequests: false, isApprover: true },
    );
    expect(row).toMatchObject({
      approved: "Not yet — returned 15 Oct 2026, 11:30",
      timeToApprove: "Returned once",
      href: "/approvals/r1",
    });
  });
});
