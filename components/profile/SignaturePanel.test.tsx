import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { SignatureState } from "@/lib/profile/signatures";
import { SignaturePanel } from "./SignaturePanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/profile/actions", () => ({
  activateSignature: vi.fn(async () => ({ ok: true })),
  saveTypedInitials: vi.fn(async () => ({ ok: true })),
  uploadSignature: vi.fn(async () => ({ ok: true })),
}));

const empty: SignatureState = { versions: [], signature: null, initials: null };

const withVersions: SignatureState = {
  signature: {
    id: "a",
    kind: "signature",
    source: "png",
    typedText: null,
    label: "Signature · v2",
    detail: "Uploaded 9 Oct 2026 · 640 × 200 px",
    status: "active",
    previewUrl: "https://example.test/sig.png",
  },
  initials: {
    id: "b",
    kind: "initials",
    source: "typed",
    typedText: "RB",
    label: "Initials · typed “RB”",
    detail: "Saved 9 Oct 2026",
    status: "kept",
    previewUrl: null,
  },
  versions: [],
};
withVersions.versions = [
  withVersions.signature!,
  withVersions.initials!,
  {
    ...withVersions.signature!,
    id: "c",
    label: "Signature · v1",
    status: "replaced",
  },
];

describe("SignaturePanel", () => {
  test("nothing yet: upload a signature, Sign with is not possible", () => {
    render(<SignaturePanel state={empty} />);
    expect(screen.getByText("No signature yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Signature" })).toBeDisabled();
    expect(
      screen.getByText(
        "Nothing yet — upload a signature or save your initials.",
      ),
    ).toBeInTheDocument();
  });

  test("shows the active signature, kept initials and the history", () => {
    render(<SignaturePanel state={withVersions} />);
    expect(screen.getByRole("radio", { name: /Signature/ })).toBeChecked();
    expect(
      screen.getByRole("img", { name: "Your current signature" }),
    ).toHaveAttribute("src", "https://example.test/sig.png");
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Initials (up to 4 characters)")).toHaveValue(
      "RB",
    );
    for (const status of ["Kept", "Replaced"]) {
      expect(screen.getByText(status)).toBeInTheDocument();
    }
    // Saving the same initials again is pointless.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
