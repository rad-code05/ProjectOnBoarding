import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { ChecklistItem } from "@/lib/requests/execution";
import { ExecutionSection } from "./ExecutionSection";

const saveExecution = vi.fn<(input: unknown) => Promise<{ ok: true }>>(
  async () => ({ ok: true }),
);
vi.mock("@/app/(app)/requests/actions", () => ({
  saveExecution: (input: unknown) => saveExecution(input),
}));

const items: ChecklistItem[] = [
  {
    key: "access_provisioned",
    label: "All authorised access provisioned or modified",
  },
  { key: "devices_enrolled", label: "Devices issued and enrolled (MDM)" },
  {
    key: "security_controls",
    label: "Security controls applied (MFA, MDM, EDR)",
  },
];

function Harness({ editable = true }: { editable?: boolean }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({
    access_provisioned: true,
  });
  return (
    <ExecutionSection
      requestId="0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b"
      items={items}
      record={{
        checks: { access_provisioned: true },
        notes: null,
        executedBy: "Raju Bholani",
      }}
      editable={editable}
      startedLabel="8 Oct 2026, 14:20"
      checks={checks}
      onChecksChange={setChecks}
    />
  );
}

describe("ExecutionSection", () => {
  test("shows the checklist of the ticket type with what is done", () => {
    render(<Harness />);
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "All authorised access provisioned or modified",
      }),
    ).toBeChecked();
    expect(screen.getByText("Raju Bholani")).toBeInTheDocument();
    expect(screen.getByText("8 Oct 2026, 14:20")).toBeInTheDocument();
  });

  test("ticking an item saves the whole checklist", async () => {
    render(<Harness />);
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Devices issued and enrolled (MDM)",
      }),
    );
    expect(saveExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        checks: { access_provisioned: true, devices_enrolled: true },
      }),
    );
    expect(await screen.findByText("2 of 3 done")).toBeInTheDocument();
  });

  test("read-only once the request has moved on", () => {
    render(<Harness editable={false} />);
    expect(
      screen.getByRole("checkbox", {
        name: "Security controls applied (MFA, MDM, EDR)",
      }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/Implementation notes/)).toBeDisabled();
  });
});
