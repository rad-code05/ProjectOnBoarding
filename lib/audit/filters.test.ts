import { describe, expect, test } from "vitest";
import {
  DEFAULT_AUDIT_FILTERS,
  auditParams,
  auditRange,
  filterChips,
  parseAuditFilters,
} from "./filters";

describe("parseAuditFilters", () => {
  test("defaults: last 7 days, test users hidden", () => {
    expect(parseAuditFilters({})).toEqual(DEFAULT_AUDIT_FILTERS);
  });

  test("reads every filter and ignores unknown values", () => {
    expect(
      parseAuditFilters({
        q: " UAM-2026 ",
        source: "ai",
        who: "user_abc123",
        groups: "signatures,nonsense,records",
        period: "30d",
        tests: "show",
      }),
    ).toEqual({
      ...DEFAULT_AUDIT_FILTERS,
      q: "UAM-2026",
      source: "ai",
      who: "user_abc123",
      groups: ["signatures", "records"],
      period: "30d",
      hideTests: false,
    });
    expect(
      parseAuditFilters({
        source: "robots",
        who: "drop table",
        period: "1y",
        from: "2026-13-40",
      }),
    ).toEqual(DEFAULT_AUDIT_FILTERS);
    expect(parseAuditFilters({ who: "system" }).who).toBe("system");
  });

  test("round-trips through the URL without the defaults", () => {
    expect(auditParams(DEFAULT_AUDIT_FILTERS).toString()).toBe("");
    const filters = parseAuditFilters({
      q: "figma",
      groups: "requests",
      from: "2026-10-01",
      to: "2026-10-15",
      tests: "show",
    });
    const params = auditParams(filters);
    expect(params.toString()).toBe(
      "q=figma&groups=requests&from=2026-10-01&to=2026-10-15&tests=show",
    );
    expect(parseAuditFilters(Object.fromEntries(params))).toEqual(filters);
  });
});

describe("auditRange", () => {
  const now = new Date("2026-10-15T08:00:00Z"); // 12:00 in Dubai

  test("7 days = today and the 6 days before, from midnight in the zone", () => {
    expect(auditRange(DEFAULT_AUDIT_FILTERS, "Asia/Dubai", now)).toEqual({
      from: "2026-10-08T20:00:00.000Z",
      to: null,
    });
  });

  test("today, all", () => {
    expect(
      auditRange(
        { ...DEFAULT_AUDIT_FILTERS, period: "today" },
        "Asia/Dubai",
        now,
      ),
    ).toEqual({ from: "2026-10-14T20:00:00.000Z", to: null });
    expect(
      auditRange(
        { ...DEFAULT_AUDIT_FILTERS, period: "all" },
        "Asia/Dubai",
        now,
      ),
    ).toEqual({ from: null, to: null });
  });

  test("picked dates include the whole last day", () => {
    expect(
      auditRange(
        { ...DEFAULT_AUDIT_FILTERS, from: "2026-10-01", to: "2026-10-15" },
        "Asia/Dubai",
        now,
      ),
    ).toEqual({
      from: "2026-09-30T20:00:00.000Z",
      to: "2026-10-15T20:00:00.000Z",
    });
  });
});

describe("filterChips", () => {
  test("board: Last 7 days + Hiding test users by default", () => {
    expect(filterChips(DEFAULT_AUDIT_FILTERS, {}).map((c) => c.label)).toEqual([
      "Last 7 days",
      "Hiding test users",
    ]);
  });

  test("a chip says what it clears", () => {
    const chips = filterChips(
      {
        ...DEFAULT_AUDIT_FILTERS,
        who: "user_moises",
        groups: ["signatures", "records"],
        from: "2026-10-01",
        to: "2026-10-15",
        hideTests: false,
      },
      { user_moises: "Moises Larez" },
    );
    expect(chips).toEqual([
      { label: "Moises Larez", clear: { who: null } },
      { label: "Signatures & approvals", clear: { groups: ["records"] } },
      { label: "Records & PDFs", clear: { groups: ["signatures"] } },
      {
        label: "1 Oct 2026 – 15 Oct 2026",
        clear: { from: null, to: null, period: "all" },
      },
    ]);
  });
});
