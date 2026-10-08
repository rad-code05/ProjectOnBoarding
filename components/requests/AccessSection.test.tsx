import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import {
  choiceLabel,
  filterCatalog,
  type AccessChoices,
  type CatalogCategory,
} from "@/lib/requests/access";
import { AccessSection } from "./AccessSection";

const setAccess = vi.fn<(input: unknown) => Promise<{ ok: true }>>(
  async () => ({ ok: true }),
);
vi.mock("@/app/(app)/requests/actions", () => ({
  setAccess: (input: unknown) => setAccess(input),
  clearAccess: vi.fn(async () => ({ ok: true })),
}));

const catalog: CatalogCategory[] = [
  {
    id: 1,
    name: "Core business",
    apps: [
      {
        id: 3,
        name: "Slack",
        actions: ["Grant", "Modify", "Remove"],
        permissions: ["Member", "Admin"],
      },
      {
        id: 8,
        name: "Figma",
        actions: ["Grant", "Modify", "Remove"],
        permissions: ["Viewer", "Editor", "Admin"],
      },
    ],
  },
  {
    id: 3,
    name: "Security, device & identity",
    apps: [
      {
        id: 16,
        name: "Hexnode (MDM)",
        actions: ["Enroll", "Remove"],
        permissions: ["Device", "Admin"],
      },
    ],
  },
];

describe("access helpers", () => {
  test("choiceLabel shows action · permission, or Not set", () => {
    expect(
      choiceLabel({ action: "Grant", permission: "Editor", notes: null }),
    ).toBe("Grant · Editor");
    expect(
      choiceLabel({ action: "Remove", permission: null, notes: null }),
    ).toBe("Remove");
    expect(choiceLabel(undefined)).toBe("Not set");
  });

  test("filterCatalog finds apps by name and can show only the set ones", () => {
    const choices: AccessChoices = {
      8: { action: "Grant", permission: "Editor", notes: null },
    };
    expect(
      filterCatalog(catalog, choices, "hex", false).map((c) =>
        c.apps.map((a) => a.name),
      ),
    ).toEqual([["Hexnode (MDM)"]]);
    expect(
      filterCatalog(catalog, choices, "", true).flatMap((c) =>
        c.apps.map((a) => a.name),
      ),
    ).toEqual(["Figma"]);
  });
});

function Harness({ initial = {} }: { initial?: AccessChoices }) {
  const [access, setAccessState] = useState(initial);
  return (
    <AccessSection
      requestId="0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b"
      catalog={catalog}
      access={access}
      onAccessChange={setAccessState}
      disabled={false}
    />
  );
}

describe("AccessSection", () => {
  test("each app offers only its own actions (Hexnode: Enroll / Remove)", () => {
    render(<Harness />);
    const hexnode = screen.getByLabelText("Hexnode (MDM) action");
    expect(
      [...hexnode.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["—", "Enroll", "Remove"]);
  });

  test("choosing an action saves it and counts it", async () => {
    render(<Harness />);
    expect(screen.getByText("0 of 3 set")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText("Slack action"),
      "Grant",
    );
    expect(setAccess).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 3, action: "Grant", permission: null }),
    );
    expect(screen.getByText("1 of 3 set")).toBeInTheDocument();
    expect(screen.getByLabelText("Slack permission")).toBeEnabled();
  });

  test("permission waits until an action is chosen", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Figma permission")).toBeDisabled();
  });
});
