import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Removals } from "@/lib/requests/offboarding";
import { RemovalSections } from "./OffboardingSections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/requests/actions", () => ({}));

const removals: Removals = {
  apps: [
    {
      id: "a1",
      appId: 10,
      name: "Slack",
      category: "Core business",
      had: "Member",
      method: null,
      doneAt: null,
    },
  ],
  equipment: [],
  access: [
    {
      id: "p1",
      typeId: 1,
      name: "Office access",
      action: "Disable",
      scope: "Badge",
      doneAt: null,
      notes: null,
    },
  ],
};

describe("RemovalSections (offboarding draft)", () => {
  test("'will be removed' is a label, not a button, and says what happens next", () => {
    render(<RemovalSections removals={removals} flag={() => null} />);
    const apps = screen.getByRole("region", { name: "Applications to remove" });
    expect(within(apps).getByText("will be removed")).toBeInTheDocument();
    expect(
      within(apps).queryByRole("button", { name: /remove/i }),
    ).not.toBeInTheDocument();
    expect(
      within(apps).getByText(
        /After Start execution you choose Delete, Suspend or Disable/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("to disable")).toBeInTheDocument();
  });
});
