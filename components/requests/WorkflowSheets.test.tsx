import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { StartExecutionSheet } from "./WorkflowSheets";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/requests/actions", () => ({
  changeState: vi.fn(async () => ({ ok: true })),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

describe("StartExecutionSheet", () => {
  test("an offboarding with section 8 incomplete says what's missing and can't start", async () => {
    const onFix = vi.fn();
    render(
      <StartExecutionSheet
        requestId="r1"
        subtitle="Marco Rossi · UAM-2026-000132"
        missing={["last working day"]}
        onFix={onFix}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "First complete section 8 · Access removal SLA: last working day.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start execution" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Go to section 8" }),
    );
    expect(onFix).toHaveBeenCalled();
  });

  test("nothing missing: execution can start", () => {
    render(
      <StartExecutionSheet requestId="r1" subtitle="x" onClose={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Start execution" }),
    ).toBeEnabled();
  });
});
