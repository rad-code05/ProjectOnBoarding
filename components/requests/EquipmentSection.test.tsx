import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import {
  equipmentDetail,
  type EquipmentItem,
  type PhysicalChoices,
  type PhysicalType,
} from "@/lib/requests/equipment";
import { EquipmentSection } from "./EquipmentSection";
import { PhysicalSection } from "./PhysicalSection";

vi.mock("@/app/(app)/requests/actions", () => ({
  saveEquipment: vi.fn(async () => ({ ok: true, id: "x" })),
  removeEquipment: vi.fn(async () => ({ ok: true })),
  setPhysical: vi.fn(async () => ({ ok: true })),
  clearPhysical: vi.fn(async () => ({ ok: true })),
}));

const requestId = "0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b";
const laptop: EquipmentItem = {
  id: "11111111-1111-4111-8111-111111111111",
  typeId: 2,
  typeName: "Laptop · macOS",
  action: "Issue",
  description: "14″ MacBook Pro",
  assetTag: "LN-0042",
  notes: null,
};
const physicalTypes: PhysicalType[] = [
  {
    id: 1,
    name: "Office access",
    actions: ["Grant", "Disable"],
    scopes: ["Badge", "Key"],
  },
  {
    id: 2,
    name: "VPN / secure access",
    actions: ["Grant", "Disable"],
    scopes: ["Corporate VPN"],
  },
  {
    id: 3,
    name: "Shared drives",
    actions: ["Grant", "Modify", "Remove"],
    scopes: ["Department", "Project"],
  },
];

function Equipment({ items }: { items: EquipmentItem[] }) {
  const [state, setState] = useState(items);
  return (
    <EquipmentSection
      requestId={requestId}
      types={[]}
      items={state}
      onItemsChange={setState}
      disabled={false}
    />
  );
}

function Physical({ choices }: { choices: PhysicalChoices }) {
  const [state, setState] = useState(choices);
  return (
    <PhysicalSection
      requestId={requestId}
      types={physicalTypes}
      choices={state}
      onChoicesChange={setState}
      disabled={false}
    />
  );
}

describe("equipmentDetail", () => {
  test("asset tag first, then the description", () => {
    expect(equipmentDetail(laptop)).toBe("Asset LN-0042 · 14″ MacBook Pro");
    expect(
      equipmentDetail({ ...laptop, assetTag: null, description: null }),
    ).toBe("No asset tag yet");
  });
});

describe("EquipmentSection", () => {
  test("lists each item with its action and counts them", () => {
    render(
      <Equipment
        items={[laptop, { ...laptop, id: "2", assetTag: "LN-0043" }]}
      />,
    );
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Laptop · macOS, Issue, Asset LN-0042 · 14″ MacBook Pro. Change",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeEnabled();
  });
});

describe("PhysicalSection", () => {
  test("one row per access type, with action · scope or Not set", () => {
    render(
      <Physical
        choices={{ 1: { action: "Grant", scope: "Badge", notes: null } }}
      />,
    );
    expect(screen.getByText("1 of 3 set")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Office access: Grant · Badge. Change",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Shared drives: not set. Change" }),
    ).toBeInTheDocument();
  });
});
