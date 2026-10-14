import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  sampleAccessChangeRecord,
  sampleOffboardingRecord,
  sampleRecord,
} from "@/lib/records/fixture";
import { SnapshotCards } from "./SnapshotCards";

const checklist = [{ key: "access_removed", label: "All access removed" }];

describe("SnapshotCards", () => {
  test("an offboarding shows how each app was removed and the SLA & handover card", () => {
    render(
      <SnapshotCards
        snapshot={sampleOffboardingRecord().snapshot}
        checklist={checklist}
        timeZone="Asia/Dubai"
      />,
    );
    const access = screen.getByRole("region", { name: "Access & equipment" });
    expect(access).toHaveTextContent("Delete · had Member · 1 Oct 2026, 12:05");
    const sla = screen.getByRole("region", {
      name: "8 · Access removal SLA & handover",
    });
    expect(within(sla).getByText("Met · 3 of 3 removed")).toBeInTheDocument();
    expect(
      within(sla).getByText("Converted to a shared mailbox"),
    ).toBeInTheDocument();
  });

  test("an onboarding has no SLA card", () => {
    render(
      <SnapshotCards
        snapshot={sampleRecord().snapshot}
        checklist={checklist}
      />,
    );
    expect(
      screen.queryByRole("region", { name: /Access removal SLA/ }),
    ).not.toBeInTheDocument();
  });

  test("an access change shows what changes, the employee was → now and what is kept", () => {
    render(
      <SnapshotCards
        snapshot={sampleAccessChangeRecord().snapshot}
        checklist={checklist}
      />,
    );
    const changes = screen.getByRole("region", { name: "What changes" });
    expect(changes).toHaveTextContent("Viewer → Full");
    expect(changes).toHaveTextContent("Removed · had Member");
    expect(
      screen.getByRole("region", { name: "Employee · was → now" }),
    ).toHaveTextContent("Product Designer → Design Lead");
    const kept = screen.getByRole("region", { name: "Kept unchanged · 2" });
    expect(kept).toHaveTextContent("Google Workspace");
    expect(kept).toHaveTextContent("Zoom");
  });
});
