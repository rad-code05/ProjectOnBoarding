import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { typeLine } from "@/lib/admin/catalog-shared";
import { TypeSheet } from "./TypeSheet";

const saveEquipmentType = vi.fn();
const saveAccessType = vi.fn();
const setEquipmentTypeActive = vi.fn();
const setAccessTypeActive = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  saveEquipmentType: (i: unknown) => saveEquipmentType(i),
  saveAccessType: (i: unknown) => saveAccessType(i),
  setEquipmentTypeActive: (i: unknown) => setEquipmentTypeActive(i),
  setAccessTypeActive: (i: unknown) => setAccessTypeActive(i),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

describe("TypeSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [
      saveEquipmentType,
      saveAccessType,
      setEquipmentTypeActive,
      setAccessTypeActive,
    ]) {
      fn.mockResolvedValue({ ok: true });
    }
  });

  test("adds an equipment type that needs a description", async () => {
    const u = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TypeSheet
        editing={{ kind: "equipment", type: null }}
        onClose={onClose}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Grant" }),
    ).not.toBeInTheDocument();
    await u.type(screen.getByLabelText("Name"), "Tablet");
    await u.click(screen.getByLabelText(/Needs a description/));
    await u.click(screen.getByRole("button", { name: "Add equipment type" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveEquipmentType).toHaveBeenCalledWith({
      id: null,
      name: "Tablet",
      actions: ["Issue", "Return"],
      needsDescription: true,
    });
  });

  test("adds an access type with scopes (Enter or still typed)", async () => {
    const u = userEvent.setup();
    render(
      <TypeSheet editing={{ kind: "access", type: null }} onClose={vi.fn()} />,
    );
    await u.type(screen.getByLabelText("Name"), "Parking");
    await u.type(screen.getByLabelText("New scope"), "Car park A{Enter}");
    await u.type(screen.getByLabelText("New scope"), "Car park B");
    await u.click(screen.getByRole("button", { name: "Add access type" }));
    await waitFor(() =>
      expect(saveAccessType).toHaveBeenCalledWith({
        id: null,
        name: "Parking",
        actions: ["Grant", "Disable"],
        scopes: ["Car park A", "Car park B"],
      }),
    );
  });

  test("an active type can be retired; it says what happens", async () => {
    const u = userEvent.setup();
    render(
      <TypeSheet
        editing={{
          kind: "access",
          type: {
            id: 3,
            name: "Shared drives",
            actions: ["Grant", "Modify", "Remove"],
            scopes: ["Department", "Project"],
            active: true,
            uses: 2,
          },
        }}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/The 2 requests that use it and their PDFs stay/),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Retire access type" }));
    await waitFor(() =>
      expect(setAccessTypeActive).toHaveBeenCalledWith({
        id: 3,
        active: false,
      }),
    );
  });
});

describe("typeLine", () => {
  test("equipment and access summaries", () => {
    expect(
      typeLine({ actions: ["Issue", "Return"], needsDescription: true }),
    ).toBe("Issue · Return — needs a description");
    expect(
      typeLine({ actions: ["Issue", "Return"], needsDescription: false }),
    ).toBe("Issue · Return");
    expect(
      typeLine({ actions: ["Grant", "Disable"], scopes: ["Badge", "Key"] }),
    ).toBe("Grant · Disable — Badge / Key");
  });
});
