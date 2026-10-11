import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { sampleRecord } from "@/lib/records/fixture";
import type { RecordPage } from "@/lib/records/page";
import { RecordView } from "./RecordView";

const ID = "5f0d2f4e-8c1a-4b7e-9a51-1d2f3e4a5b6c";

const page = (patch: Partial<RecordPage> = {}): RecordPage => {
  const sample = sampleRecord();
  return {
    id: ID,
    ticketId: "UAM-2026-000124",
    type: "onboarding",
    closedLabel: "9 Oct 2026, 16:05",
    snapshot: sample.snapshot,
    checklist: sample.checklist,
    it: {
      name: "Raju Bholani",
      signedLabel: "9 Oct 2026, 14:12",
      imageUrl: null,
      typedText: "RB",
      fingerprint: "9b1e04c7aaaaaaaa",
      note: "Figma is Viewer now",
    },
    approval: {
      name: "Moises Larez",
      signedLabel: "9 Oct 2026, 16:05",
      imageUrl: null,
      typedText: "ML",
      fingerprint: "43779ef2bbbbbbbb",
      note: null,
    },
    pdf: {
      requestId: ID,
      ticketId: "UAM-2026-000124",
      fileName: "jose.muller-onboarding.pdf",
      storagePath: "UAM-2026-000124/jose.muller-onboarding.pdf",
      sha256:
        "43779ef2a1c0b5d4e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d",
      byteSize: 52009,
      timezone: "Asia/Dubai",
      generatedAt: "2026-10-09T12:05:10Z",
      generatedLabel: "9 Oct 2026, 16:05",
    },
    ...patch,
  };
};

describe("RecordView", () => {
  test("the PDF card: file, contents, fingerprint, Download and Preview", () => {
    render(<RecordView record={page()} justClosed={false} />);
    const card = screen.getByRole("region", { name: "Access record" });
    expect(card).toHaveTextContent("jose.muller-onboarding.pdf");
    expect(card).toHaveTextContent(
      "Form v4.1 · all 11 sections · both signatures",
    );
    expect(card).toHaveTextContent("9 Oct 2026, 16:05 (Asia/Dubai)");
    expect(card).toHaveTextContent("43779ef2a1c0b5d4…");
    expect(
      within(card).getByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", `/records/${ID}/pdf`);
    const preview = within(card).getByRole("link", { name: "Preview" });
    expect(preview).toHaveAttribute("href", `/records/${ID}/pdf?view=1`);
    expect(preview).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("right after confirming: the closed message", () => {
    render(<RecordView record={page()} justClosed />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Confirmed, signed and closed",
    );
  });

  test("both signatures with their marks, times and Raju's note", () => {
    render(<RecordView record={page()} justClosed={false} />);
    const sigs = screen.getByRole("region", { name: "Signatures" });
    expect(sigs).toHaveTextContent("IT execution · section 9");
    expect(sigs).toHaveTextContent("Raju Bholani");
    expect(sigs).toHaveTextContent("Approver · sections 3, 10, 11");
    expect(sigs).toHaveTextContent("Moises Larez");
    expect(sigs).toHaveTextContent("“Figma is Viewer now”");
    expect(within(sigs).getByText("ML")).toBeInTheDocument();
  });

  test("the signed record opens in place", async () => {
    render(<RecordView record={page()} justClosed={false} />);
    const access = screen.getByText("Access & equipment");
    await userEvent.click(access);
    expect(screen.getByText("Grant · Licensed")).toBeVisible();
  });

  test("no PDF yet: says so, no download links", () => {
    render(<RecordView record={page({ pdf: null })} justClosed={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The PDF could not be made just now",
    );
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
  });
});
