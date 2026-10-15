import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_AUDIT_FILTERS } from "@/lib/audit/filters";
import type { AuditEntry, AuditPage } from "@/lib/audit/log";
import { AuditLog } from "./AuditLog";

const loadMoreAudit = vi.fn();
const countAudit = vi.fn();
const replace = vi.fn();
vi.mock("@/app/(app)/audit/actions", () => ({
  loadMoreAudit: (...args: unknown[]) => loadMoreAudit(...args),
  countAudit: (...args: unknown[]) => countAudit(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const RECORD = "11111111-1111-1111-1111-111111111111";
const entry = (id: number, patch: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  at: new Date().toISOString(),
  who: "Raju Bholani",
  what: "changed Figma on UAM-2026-000141 — Editor → Admin",
  context: "section 5",
  chip: "People",
  roles: "Admin, IT operator",
  record: "UAM-2026-000141 · Anna Keller",
  recordHref: `/records/${RECORD}`,
  kind: "Access modification · Requests",
  changes: [{ field: "Permission", before: "Editor", after: "Admin" }],
  facts: [],
  ...patch,
});

const people = [
  { id: "user_raju", name: "Raju Bholani", test: false },
  { id: "user_moises", name: "Moises Larez", test: false },
  { id: "user_e2e", name: "E2E Admin", test: true },
];

function show(page: AuditPage, filters = DEFAULT_AUDIT_FILTERS) {
  return render(
    <AuditLog
      filters={filters}
      initial={page}
      people={people}
      timeZone="Asia/Dubai"
    />,
  );
}

describe("AuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countAudit.mockResolvedValue(48);
  });

  test("events by day, in plain words, with the active filters as chips", () => {
    show({
      entries: [
        entry(2),
        entry(1, {
          who: "System",
          what: "updated Anna Keller's access inventory — 1 added, 2 ended",
          chip: "System",
          at: "2026-10-01T08:00:00Z",
        }),
      ],
      total: 2,
      next: null,
    });
    expect(screen.getByText(/^Today · /)).toBeInTheDocument();
    expect(screen.getByText("1 Oct 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Raju Bholani changed Figma on UAM-2026-000141 — Editor → Admin/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 events · newest first · times in Dubai"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filters · 2" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Active filters" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Last 7 days", "Hiding test users"]);
    expect(
      screen.queryByRole("button", { name: /more/ }),
    ).not.toBeInTheDocument();
  });

  test("removing a chip or picking a source changes the URL", async () => {
    const user = userEvent.setup();
    show({ entries: [entry(1)], total: 1, next: null });
    await user.click(
      screen.getByRole("button", { name: "Remove filter: Hiding test users" }),
    );
    expect(replace).toHaveBeenLastCalledWith("/audit?tests=show", {
      scroll: false,
    });
    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(replace).toHaveBeenLastCalledWith("/audit?source=system", {
      scroll: false,
    });
  });

  test("an event opens its details: when, who, record, what changed", async () => {
    const user = userEvent.setup();
    show({ entries: [entry(3159)], total: 1, next: null });
    await user.click(screen.getByRole("button", { name: /Raju Bholani/ }));
    const sheet = screen.getByRole("dialog", {
      name: "Raju Bholani changed Figma on UAM-2026-000141 — Editor → Admin",
    });
    expect(sheet).toHaveTextContent("Audit event · People");
    expect(sheet).toHaveTextContent("(Dubai, server time)");
    expect(sheet).toHaveTextContent("Raju Bholani · Admin, IT operator");
    expect(
      within(sheet).getByRole("link", {
        name: "UAM-2026-000141 · Anna Keller →",
      }),
    ).toHaveAttribute("href", `/records/${RECORD}`);
    expect(
      within(sheet).getByRole("row", { name: "Permission Editor Admin" }),
    ).toBeInTheDocument();
    expect(sheet).toHaveTextContent("Event #3159 · append-only");
  });

  test("Show more adds the next page", async () => {
    const user = userEvent.setup();
    loadMoreAudit.mockResolvedValue({
      entries: [entry(1, { who: "Moises Larez", what: "signed in" })],
      total: 31,
      next: null,
    });
    show({
      entries: [entry(2)],
      total: 2,
      next: { at: "2026-10-15T06:00:00Z", id: 2 },
    });
    await user.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(loadMoreAudit).toHaveBeenCalledWith("", {
      at: "2026-10-15T06:00:00Z",
      id: 2,
    });
    expect(
      await screen.findByRole("button", { name: /Moises Larez signed in/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /more/ }),
    ).not.toBeInTheDocument();
  });

  test("filters sheet: who, groups, test users; Show N events applies", async () => {
    const user = userEvent.setup();
    show({ entries: [entry(1)], total: 1, next: null });
    await user.click(screen.getByRole("button", { name: "Filters · 2" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    // Test users are hidden, so they can't be picked either.
    expect(
      within(sheet).queryByRole("radio", { name: "E2E Admin" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(sheet).getByRole("radio", { name: "Moises Larez" }),
    );
    await user.click(
      within(sheet).getByRole("checkbox", { name: /Signatures & approvals/ }),
    );
    await user.click(within(sheet).getByRole("radio", { name: "30 days" }));
    await waitFor(() =>
      expect(countAudit).toHaveBeenLastCalledWith(
        "who=user_moises&groups=signatures&period=30d",
      ),
    );
    await user.click(
      await within(sheet).findByRole("button", { name: "Show 48 events" }),
    );
    expect(replace).toHaveBeenLastCalledWith(
      "/audit?who=user_moises&groups=signatures&period=30d",
      { scroll: false },
    );
  });

  test("switching the test users on shows them in Who", async () => {
    const user = userEvent.setup();
    show({ entries: [], total: 0, next: null });
    expect(screen.getByText("No events match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters · 2" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await user.click(
      within(sheet).getByRole("switch", { name: /Hide the test users/ }),
    );
    expect(
      within(sheet).getByRole("radio", { name: "E2E Admin" }),
    ).toBeInTheDocument();
  });
});
