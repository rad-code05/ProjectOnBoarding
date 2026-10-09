// @vitest-environment node
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { describe, expect, test } from "vitest";
import {
  accessRows,
  employeeRows,
  signButtonLabel,
  signErrorMessage,
  signingChecks,
  snapshotSchema,
  type SigningReview,
} from "./signing";

// The same example as supabase/tests/database/signing.test.sql: the database's
// canonical form + SHA-256 must equal the RFC 8785 reference library's.
const SHARED_EXAMPLE = {
  request: {
    first_name: "José",
    last_name: "Müller",
    ticket_id: "UAM-2026-000124",
    effective_date: "2026-10-14",
    custom_fields: {},
  },
  access: [
    { app: "Figma", action: "Grant", permission: "Editor", notes: null },
  ],
  execution: {
    checks: { devices_enrolled: true, access_provisioned: true },
    notes: 'Laptop €1 "MacBook"\nVPN\tok\u0001',
  },
};
const DATABASE_SHA256 =
  "43779ef290cabb92960c7ca2dcd8c79ca4668468df98741457190d41ea06e239";

const snapshot = snapshotSchema.parse({
  request: {
    id: "x",
    ticket_id: "UAM-2026-000124",
    type: "onboarding",
    form_version: "4.1",
    first_name: "Anna",
    last_name: "Keller",
    work_email: "anna.keller@laine.ai",
    job_title: "Product Designer",
    department: "Engineering",
    country: "CH",
    manager_name: "Mara Manager",
    requestor_name: null,
    effective_date: "2026-10-14",
  },
  access: [
    {
      category: "Core",
      app: "Figma",
      action: "Grant",
      permission: "Editor",
      notes: null,
    },
  ],
  equipment: [
    {
      type: "Laptop",
      action: "Issue",
      description: "MacBook Pro",
      asset_tag: "LT-042",
      notes: null,
    },
  ],
  physical_access: [
    { type: "Office access", action: "Grant", scope: "Badge", notes: null },
  ],
  execution: {
    checks: { access_provisioned: true },
    notes: null,
    executed_by: "u",
    executed_by_name: "Raju Bholani",
  },
});

const review = (patch: Partial<SigningReview>): SigningReview => ({
  snapshot: {},
  stateOk: true,
  missingFields: [],
  checklistComplete: true,
  signature: {
    kind: "initials",
    source: "typed",
    typedText: "RB",
    previewUrl: null,
    detail: "",
  },
  approvers: ["Moises"],
  ...patch,
});

describe("snapshot fingerprint", () => {
  test("the RFC 8785 library gives the same SHA-256 as the database", () => {
    const text = canonicalize(SHARED_EXAMPLE)!;
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(
      DATABASE_SHA256,
    );
  });
});

describe("summary cards", () => {
  test("employee rows, with country names, formatted dates and — for empty", () => {
    const rows = employeeRows(snapshot);
    expect(rows).toContainEqual({ label: "Name", value: "Anna Keller" });
    expect(rows).toContainEqual({ label: "Country", value: "Switzerland" });
    expect(rows).toContainEqual({
      label: "Effective date",
      value: "14 Oct 2026",
    });
    expect(rows).toContainEqual({ label: "Requested by", value: "—" });
  });

  test("access rows: apps, equipment, physical access", () => {
    expect(accessRows(snapshot)).toEqual([
      { label: "Figma", value: "Grant · Editor" },
      { label: "Laptop · MacBook Pro", value: "Issue · LT-042" },
      { label: "Office access", value: "Grant · Badge" },
    ]);
  });
});

describe("blocking checks", () => {
  test("all passing", () => {
    expect(signingChecks(review({})).every((c) => c.ok)).toBe(true);
  });

  test("each failure says what and where to fix it", () => {
    const checks = signingChecks(
      review({
        missingFields: ["Job title / role", "Country"],
        checklistComplete: false,
        signature: null,
      }),
    );
    expect(checks.filter((c) => !c.ok)).toEqual([
      {
        ok: false,
        label: "Required fields empty: Job title / role, Country",
        fix: { section: 2 },
      },
      {
        ok: false,
        label: "Section 9 checklist is not complete",
        fix: { section: 9 },
      },
      {
        ok: false,
        label: "Add your signature or initials in My profile",
        fix: { href: "/profile" },
      },
    ]);
  });

  test("a request that left execution can't be signed", () => {
    expect(signingChecks(review({ stateOk: false }))[0]).toMatchObject({
      ok: false,
    });
  });
});

describe("wording", () => {
  test("the button names the approver only when there is exactly one", () => {
    expect(signButtonLabel(["Moises"])).toBe("Sign & send to Moises");
    expect(signButtonLabel(["Moises", "Celine"])).toBe(
      "Sign & send for confirmation",
    );
    expect(signButtonLabel([])).toBe("Sign & send for confirmation");
  });

  test.each([
    [
      "40001",
      "the request changed…",
      "This request changed while you were reviewing it. Close this and review it again.",
    ],
    [
      "23514",
      "required fields are empty: Country, Manager",
      "Fill in first: Country, Manager.",
    ],
    [
      "23514",
      "add your signature or initials in My profile first",
      "Add your signature or initials in My profile first.",
    ],
    [
      "23514",
      "section 9 checklist is not complete",
      "Tick every item in section 9 first.",
    ],
    [
      "23514",
      "only a request in execution can be signed",
      "This request has already been signed or closed.",
    ],
    [
      "42501",
      "only an IT operator signs section 9",
      "Only an IT operator can sign section 9.",
    ],
    [
      undefined,
      undefined,
      "Could not sign. Check your connection and try again.",
    ],
  ])("%s %s", (code, message, expected) => {
    expect(signErrorMessage(code, message)).toBe(expected);
  });
});
