import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { approvalErrorMessage } from "@/lib/approvals/decide";
import type { ApprovalReview } from "@/lib/approvals/review";
import { snapshotSchema } from "@/lib/requests/signing";
import { ConfirmSignSheet } from "./ConfirmSignSheet";
import { ReturnSheet } from "./ReturnSheet";

const confirmRequest = vi.fn();
const returnRequest = vi.fn();
const push = vi.fn();
vi.mock("@/app/(app)/approvals/actions", () => ({
  confirmRequest: (input: unknown) => confirmRequest(input),
  returnRequest: (input: unknown) => returnRequest(input),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const SNAPSHOT = {
  request: {
    ticket_id: "UAM-2026-000124",
    type: "onboarding",
    form_version: "4.1",
    first_name: "Anna",
    last_name: "Keller",
    work_email: "anna@laine.ai",
    job_title: "Product Designer",
    department: "Design",
    country: "CH",
    manager_name: "Mara",
    requestor_name: "Rita",
    effective_date: "2026-10-14",
    execution_started_at: null,
  },
  access: [{ app: "Figma", action: "Grant", permission: "Viewer" }],
  equipment: [],
  physical_access: [],
  execution: {
    checks: { access_provisioned: true },
    notes: null,
    executed_by_name: "Raju Bholani",
  },
};

const ID = "5f0d2f4e-8c1a-4b7e-9a51-1d2f3e4a5b6c";
const review = (patch: Partial<ApprovalReview> = {}): ApprovalReview => ({
  id: ID,
  ticketId: "UAM-2026-000124",
  type: "onboarding",
  state: "pending_confirmation",
  snapshot: SNAPSHOT,
  checklist: [
    {
      key: "access_provisioned",
      label: "All authorised access provisioned or modified",
    },
  ],
  it: {
    name: "Raju Bholani",
    signedLabel: "9 Oct 2026, 14:12",
    imageUrl: null,
    typedText: "RB",
    fingerprint:
      "43779ef290cabb92960c7ca2dcd8c79ca4668468df98741457190d41ea06e239",
    note: "Fixed — Figma is now Viewer",
  },
  approval: null,
  mine: {
    kind: "initials",
    source: "typed",
    typedText: "ML",
    previewUrl: null,
    detail: "",
  },
  ownRequest: false,
  ...patch,
});

function renderConfirm(r = review(), onReturn = vi.fn()) {
  render(
    <ConfirmSignSheet
      review={r}
      snapshot={snapshotSchema.parse(SNAPSHOT)}
      signerName="Moises Larez"
      onReturn={onReturn}
      onClose={vi.fn()}
    />,
  );
  return { onReturn };
}

describe("ConfirmSignSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmRequest.mockResolvedValue({ ok: true });
    returnRequest.mockResolvedValue({ ok: true });
  });

  test("shows Raju's note, his signature and fingerprint; confirming waits for the tick", async () => {
    const u = userEvent.setup();
    renderConfirm();
    expect(screen.getByText("Fixed — Figma is now Viewer")).toBeInTheDocument();
    expect(screen.getByText("RB")).toBeInTheDocument();
    expect(
      screen.getByText(/Fingerprint 43779ef290cabb92/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Approver · sections 3, 10, 11"),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "Confirm, sign & close",
    });
    expect(confirm).toBeDisabled();
    await u.click(screen.getByLabelText(/I have reviewed this record/));
    await u.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/approvals"));
    expect(confirmRequest).toHaveBeenCalledWith({
      requestId: ID,
      snapshot: SNAPSHOT,
    });
  });

  test("own request or no signature on file: confirming is blocked and says why", () => {
    renderConfirm(review({ ownRequest: true }));
    expect(
      screen.getByText(/another approver must confirm it/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/I have reviewed this record/)).toBeDisabled();
  });

  test("Return to Raju switches to the return sheet", async () => {
    const u = userEvent.setup();
    const { onReturn } = renderConfirm();
    await u.click(screen.getByRole("button", { name: "Return to Raju" }));
    expect(onReturn).toHaveBeenCalled();
  });
});

describe("ReturnSheet", () => {
  test("needs a comment; sends it with the ticked sections", async () => {
    const u = userEvent.setup();
    render(
      <ReturnSheet
        requestId={ID}
        eyebrow="Anna Keller · UAM"
        onClose={vi.fn()}
      />,
    );
    const send = screen.getByRole("button", { name: "Return to Raju" });
    expect(send).toBeDisabled();
    await u.click(screen.getByLabelText("5 · Application access"));
    await u.type(
      screen.getByLabelText(/Comment for Raju/),
      "Figma should be Viewer",
    );
    await u.click(send);
    await waitFor(() =>
      expect(returnRequest).toHaveBeenCalledWith({
        requestId: ID,
        comment: "Figma should be Viewer",
        sections: [5],
      }),
    );
  });
});

describe("approvalErrorMessage", () => {
  test.each([
    [
      "40001",
      undefined,
      "This request changed while you were reviewing it. Close this and review it again.",
    ],
    [
      "42501",
      "nobody confirms their own request",
      "You prepared this request — another approver must confirm it.",
    ],
    [
      "42501",
      "only an approver confirms or returns a request",
      "Only an approver can do this.",
    ],
    [
      "23514",
      "add your signature or initials in My profile first",
      "Add your signature or initials in My profile first.",
    ],
    [
      "23514",
      "this request is not awaiting confirmation",
      "This request was already confirmed or returned.",
    ],
  ])("%s %s", (code, message, expected) => {
    expect(approvalErrorMessage(code, message)).toBe(expected);
  });
});
