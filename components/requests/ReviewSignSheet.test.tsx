import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { SigningReview } from "@/lib/requests/signing";
import { ReviewSignSheet } from "./ReviewSignSheet";

const loadSigningReview = vi.fn();
const signRequest = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/requests/signing-actions", () => ({
  loadSigningReview: (id: string) => loadSigningReview(id),
  signRequest: (input: unknown) => signRequest(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const SNAPSHOT = {
  request: {
    id: "r",
    ticket_id: "UAM-2026-000124",
    type: "onboarding",
    form_version: "4.1",
    first_name: "José",
    last_name: "Müller",
    work_email: "jose.muller@laine.ai",
    job_title: "Product Designer",
    department: "Engineering",
    country: "CH",
    manager_name: "Mara",
    requestor_name: "Rita",
    effective_date: "2026-10-14",
    execution_started_at: "2026-10-09T07:12:00.000000Z",
  },
  access: [
    {
      category: "Core",
      app: "Figma",
      action: "Grant",
      permission: "Editor",
      notes: null,
    },
  ],
  equipment: [],
  physical_access: [],
  execution: {
    checks: { access_provisioned: true, devices_enrolled: true },
    notes: "Laptop shipped",
    executed_by: "u",
    executed_by_name: "Raju Bholani",
  },
};

const CHECKLIST = [
  {
    key: "access_provisioned",
    label: "All authorised access provisioned or modified",
  },
  { key: "devices_enrolled", label: "Devices issued and enrolled (MDM)" },
];

const review = (patch: Partial<SigningReview> = {}): SigningReview => ({
  snapshot: SNAPSHOT,
  stateOk: true,
  missingFields: [],
  checklistComplete: true,
  signature: {
    kind: "initials",
    source: "typed",
    typedText: "RB",
    previewUrl: null,
    detail: "Saved 9 Oct 2026",
  },
  approvers: ["Moises"],
  signerName: "Raju Bholani",
  ...patch,
});

function renderSheet(onEdit = vi.fn(), onClose = vi.fn()) {
  render(
    <ReviewSignSheet
      requestId="5f0d2f4e-8c1a-4b7e-9a51-1d2f3e4a5b6c"
      eyebrow="UAM-2026-000124 · Onboarding"
      checklist={CHECKLIST}
      onEdit={onEdit}
      onClose={onClose}
    />,
  );
  return { onEdit, onClose };
}

describe("ReviewSignSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSigningReview.mockResolvedValue({ ok: true, review: review() });
    signRequest.mockResolvedValue({ ok: true });
  });

  test("shows what will be signed, and Sign waits for the confirmation tick", async () => {
    const u = userEvent.setup();
    renderSheet();
    const sign = await screen.findByRole("button", {
      name: "Sign & send to Moises",
    });
    expect(screen.getByText("José Müller")).toBeInTheDocument();
    expect(screen.getByText("Grant · Editor")).toBeInTheDocument();
    expect(screen.getByText("RB")).toBeInTheDocument();
    expect(
      screen.getByText("Set by the server when you sign"),
    ).toBeInTheDocument();
    expect(screen.getByText("jose.muller-onboarding.pdf")).toBeInTheDocument();
    expect(sign).toBeDisabled();

    await u.click(screen.getByLabelText(/I confirm the details above/));
    expect(sign).toBeEnabled();
  });

  test("signing sends the reviewed snapshot back, then closes and refreshes", async () => {
    const u = userEvent.setup();
    const { onClose } = renderSheet();
    await u.click(await screen.findByLabelText(/I confirm the details above/));
    await u.click(
      screen.getByRole("button", { name: "Sign & send to Moises" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(signRequest).toHaveBeenCalledWith({
      requestId: "5f0d2f4e-8c1a-4b7e-9a51-1d2f3e4a5b6c",
      snapshot: SNAPSHOT,
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("a failing check blocks signing and Fix opens the section", async () => {
    loadSigningReview.mockResolvedValue({
      ok: true,
      review: review({ checklistComplete: false, approvers: [] }),
    });
    const u = userEvent.setup();
    const { onEdit } = renderSheet();
    const sign = await screen.findByRole("button", {
      name: "Sign & send for confirmation",
    });
    await u.click(screen.getByLabelText(/I confirm the details above/));
    expect(sign).toBeDisabled();
    expect(
      screen.getByText("Section 9 checklist is not complete"),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Fix" }));
    expect(onEdit).toHaveBeenCalledWith(9);
  });

  test("changed since the review: says so and offers to review again", async () => {
    signRequest.mockResolvedValue({
      ok: false,
      message:
        "This request changed while you were reviewing it. Close this and review it again.",
    });
    const u = userEvent.setup();
    renderSheet();
    await u.click(await screen.findByLabelText(/I confirm the details above/));
    await u.click(
      screen.getByRole("button", { name: "Sign & send to Moises" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "changed while you were reviewing",
    );
    await u.click(screen.getByRole("button", { name: "Review again" }));
    await waitFor(() => expect(loadSigningReview).toHaveBeenCalledTimes(2));
  });
});
