import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { drawStrokes } from "./SignaturePad";
import { UploadSignatureSheet } from "./UploadSignatureSheet";

const uploadSignature = vi.fn();
vi.mock("@/app/(app)/profile/actions", () => ({
  uploadSignature: (form: FormData) => uploadSignature(form),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeAll(() => {
  // jsdom has no modal dialogs and no canvas drawing: stub just enough.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(new Blob(["png"], { type: "image/png" }));
  };
});

/** One stroke on the pad: press, move, lift. */
function drawOn(pad: HTMLElement) {
  fireEvent.pointerDown(pad, {
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerMove(pad, { pointerId: 1, clientX: 40, clientY: 30 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
}

describe("drawStrokes", () => {
  const ctx = () =>
    ({
      canvas: { width: 100, height: 50 },
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    }) as unknown as CanvasRenderingContext2D &
      Record<string, ReturnType<typeof vi.fn>>;

  test("a tap becomes a dot, a stroke a smoothed line, scaled", () => {
    const c = ctx();
    drawStrokes(
      c,
      [
        [{ x: 5, y: 5 }],
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 10 },
        ],
      ],
      2,
    );
    expect(c.clearRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(c.arc).toHaveBeenCalledWith(10, 10, 2.6, 0, 2 * Math.PI);
    expect(c.moveTo).toHaveBeenCalledWith(0, 0);
    expect(c.quadraticCurveTo).toHaveBeenCalledWith(20, 0, 30, 10);
    expect(c.lineTo).toHaveBeenCalledWith(40, 20);
  });
});

describe("UploadSignatureSheet — Draw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadSignature.mockResolvedValue({ ok: true });
  });

  test("opens on Draw; Save waits for a drawing", () => {
    render(<UploadSignatureSheet kind="signature" onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Draw" })).toBeChecked();
    expect(
      screen.getByRole("img", { name: /Pad to draw your signature/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save as active" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("Undo and Clear remove strokes", () => {
    render(<UploadSignatureSheet kind="signature" onClose={vi.fn()} />);
    const pad = screen.getByRole("img", { name: /Pad to draw/ });
    drawOn(pad);
    drawOn(pad);
    const save = screen.getByRole("button", { name: "Save as active" });
    expect(save).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(save).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(save).toBeDisabled();
  });

  test("the drawing goes to the server as a PNG of the right kind", async () => {
    const onClose = vi.fn();
    render(<UploadSignatureSheet kind="initials" onClose={onClose} />);
    drawOn(screen.getByRole("img", { name: /Pad to draw your initials/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save as active" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const form = uploadSignature.mock.calls[0][0] as FormData;
    expect(form.get("kind")).toBe("initials");
    const file = form.get("file") as File;
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("drawn-initials.png");
  });

  test("Upload PNG shows the file picker instead of the pad", async () => {
    const u = userEvent.setup();
    const { container } = render(
      <UploadSignatureSheet kind="signature" onClose={vi.fn()} />,
    );
    await u.click(screen.getByRole("radio", { name: "Upload PNG" }));
    expect(screen.queryByRole("img", { name: /Pad to draw/ })).toBeNull();
    expect(
      container.ownerDocument.querySelector('input[type="file"]'),
    ).not.toBeNull();
  });
});
