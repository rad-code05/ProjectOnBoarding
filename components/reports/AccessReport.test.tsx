import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  AccessHolderList,
  AccessItemBars,
  AccessKindTabs,
} from "./AccessReport";

describe("AccessKindTabs", () => {
  test("three tabs as links; the current one is marked", () => {
    render(<AccessKindTabs kind="equipment" hrefFor={(k) => `/r?kind=${k}`} />);
    const nav = screen.getByRole("navigation", { name: "What to show" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Applications", "Devices", "Access"]);
    expect(within(nav).getByRole("link", { name: "Devices" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("AccessItemBars", () => {
  test("each row opens who holds it; the number is written", () => {
    render(
      <AccessItemBars
        items={[
          {
            key: "app:1",
            name: "Slack",
            category: "Core business",
            holders: 41,
          },
          {
            key: "app:4",
            name: "GitHub",
            category: "Core business",
            holders: 22,
          },
        ]}
        hrefFor={(key) => `/h?item=${key}`}
      />,
    );
    const slack = screen.getByRole("link", { name: /Slack/ });
    expect(slack).toHaveAttribute("href", "/h?item=app:1");
    expect(slack).toHaveTextContent("Core business");
    expect(slack).toHaveTextContent("41");
  });
});

describe("AccessHolderList", () => {
  test("a card per person: permission, since, granting request, Leaving", () => {
    render(
      <AccessHolderList
        rows={[
          {
            id: "i1",
            name: "Jonas Meier",
            subtitle: "jonas.meier@example.test · Engineering",
            detail: "Maintain",
            since: "3 Mar 2026",
            grantedBy: "UAM-2026-000021",
            grantedHref: "/records/g1",
            leaving: { ticketId: "UAM-2026-000149", href: "/requests/o1" },
          },
        ]}
      />,
    );
    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("Jonas Meier");
    expect(card).toHaveTextContent("Maintain");
    expect(card).toHaveTextContent("3 Mar 2026");
    expect(
      within(card).getByRole("link", { name: "UAM-2026-000021" }),
    ).toHaveAttribute("href", "/records/g1");
    expect(card).toHaveTextContent(
      "Leaving — offboarding UAM-2026-000149 is open",
    );
    expect(
      within(card).getByRole("link", { name: "UAM-2026-000149" }),
    ).toHaveAttribute("href", "/requests/o1");
  });
});
