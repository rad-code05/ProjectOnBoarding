import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
  choiceLabel,
  filterCatalog,
  joinRoles,
  rolesLabel,
  splitRoles,
  type AccessChoices,
  type OtherApp,
  type CatalogCategory,
} from "@/lib/requests/access";
import { AccessSection } from "./AccessSection";

const setAccess = vi.fn<(input: unknown) => Promise<{ ok: true }>>(
  async () => ({ ok: true }),
);
vi.mock("@/app/(app)/requests/actions", () => ({
  setAccess: (input: unknown) => setAccess(input),
  clearAccess: vi.fn(async () => ({ ok: true })),
  saveOther: vi.fn(async () => ({ ok: true, id: "x" })),
  removeOther: vi.fn(async () => ({ ok: true })),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

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

  test("several roles: split, join in the app's order, short label", () => {
    expect(splitRoles(" Cloud Run Admin ;Editor; ")).toEqual([
      "Cloud Run Admin",
      "Editor",
    ]);
    expect(splitRoles(null)).toEqual([]);
    const options = ["Viewer", "Editor", "Cloud Run Admin"];
    expect(joinRoles(["Cloud Run Admin", "Editor"], options)).toBe(
      "Editor; Cloud Run Admin",
    );
    expect(joinRoles([], options)).toBeNull();
    expect(rolesLabel(null)).toBe("—");
    expect(rolesLabel("Editor")).toBe("Editor");
    expect(rolesLabel("Editor; Cloud Run Admin")).toBe("2 roles");
  });
});

function Harness({
  initial = {},
  initialOthers = [],
  apps = catalog,
}: {
  initial?: AccessChoices;
  initialOthers?: OtherApp[];
  apps?: CatalogCategory[];
}) {
  const [access, setAccessState] = useState(initial);
  const [others, setOthers] = useState(initialOthers);
  return (
    <AccessSection
      requestId="0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b"
      catalog={apps}
      access={access}
      onAccessChange={setAccessState}
      others={others}
      onOthersChange={setOthers}
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
    expect(await screen.findByText("1 of 3 set")).toBeInTheDocument();
    expect(screen.getByLabelText("Slack permission")).toBeEnabled();
  });

  test("permission waits until an action is chosen", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Figma permission")).toBeDisabled();
  });

  test("other applications are listed under Other and counted", () => {
    render(
      <Harness
        initialOthers={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Notion",
            action: "Grant",
            permission: "Member",
            notes: null,
          },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notion: Grant · Member. Change" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 3 set · 1 other")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add other application" }),
    ).toBeEnabled();
  });

  test("an app with several roles opens checkboxes and saves them in its order", async () => {
    const cloud: CatalogCategory[] = [
      {
        id: 2,
        name: "Engineering, cloud & data",
        apps: [
          {
            id: 21,
            name: "Google Cloud",
            actions: ["Grant", "Modify", "Remove"],
            permissions: ["Viewer", "Editor", "Cloud Run Admin"],
            multiple: true,
          },
        ],
      },
    ];
    render(
      <Harness
        apps={cloud}
        initial={{ 21: { action: "Grant", permission: "Editor", notes: null } }}
      />,
    );
    // Desktop: a button instead of the permission dropdown.
    expect(screen.queryByLabelText("Google Cloud permission")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Google Cloud roles: Editor. Change",
      }),
    );
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent("1 chosen");
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Cloud Run Admin" }),
    );
    expect(sheet).toHaveTextContent("2 chosen");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(setAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 21,
        action: "Grant",
        permission: "Editor; Cloud Run Admin",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Google Cloud roles: Editor; Cloud Run Admin. Change",
      }),
    ).toHaveTextContent("2 roles");
  });
});
