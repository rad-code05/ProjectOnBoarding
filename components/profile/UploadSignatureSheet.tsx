"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { uploadSignature } from "@/app/(app)/profile/actions";
import {
  AlertIcon,
  Button,
  CheckIcon,
  InlineError,
  Sheet,
  sheetPill,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  SignaturePad,
  type SignaturePadHandle,
  type Stroke,
} from "./SignaturePad";

type Kind = "signature" | "initials";

const MIN: Record<Kind, [number, number]> = {
  signature: [300, 100],
  initials: [60, 40],
};

type Picked = { file: File; url: string; width: number; height: number };
type Mode = "draw" | "upload";

/**
 * A new signature or initials: drawn with a finger / stylus (design: Phone ·
 * Draw signature) or uploaded as a PNG (Phone · Replace signature). Either
 * way it reaches the server as a PNG, which checks and re-draws it again.
 */
export function UploadSignatureSheet({
  kind,
  onClose,
}: {
  kind: Kind;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const [mode, setMode] = useState<Mode>("draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const pad = useRef<SignaturePadHandle>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const [minWidth, minHeight] = MIN[kind];

  // Free the previous preview when another file is chosen or the sheet closes.
  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.url);
  }, [picked]);

  const choose = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      setPicked({
        file,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setPicked(null);
      setError("That file isn't a readable image.");
    };
    img.src = url;
  };

  const checks = picked
    ? [
        { ok: picked.file.type === "image/png", label: "PNG image" },
        { ok: picked.file.size <= 1024 * 1024, label: "Under 1 MB" },
        {
          ok: picked.width >= minWidth && picked.height >= minHeight,
          label: `At least ${minWidth} × ${minHeight} px — transparent background recommended`,
        },
      ]
    : [];
  const allOk = checks.length > 0 && checks.every((check) => check.ok);
  const canSave = mode === "draw" ? strokes.length > 0 : allOk;

  const save = () =>
    start(async () => {
      let file = picked?.file;
      if (mode === "draw") {
        const png = await pad.current?.toPng();
        file = png
          ? new File([png], `drawn-${kind}.png`, { type: "image/png" })
          : undefined;
      }
      if (!file) return;
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const result = await uploadSignature(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      router.refresh();
    });

  const noun = kind === "signature" ? "signature" : "initials";
  return (
    <Sheet
      eyebrow="Signature & initials"
      title={kind === "signature" ? "Replace signature" : "New initials"}
      onClose={onClose}
    >
      <fieldset className="grid grid-cols-2 gap-1 rounded-pill bg-sand p-1">
        <legend className="sr-only">How to add it</legend>
        {(["draw", "upload"] as const).map((option) => (
          <label
            key={option}
            className={sheetPill(
              mode === option,
              mode === option ? "bg-ink text-paper" : undefined,
            )}
          >
            <input
              type="radio"
              name={`${inputId}-mode`}
              value={option}
              checked={mode === option}
              onChange={() => {
                setMode(option);
                setError(null);
              }}
              className="sr-only"
            />
            {option === "draw" ? "Draw" : "Upload PNG"}
          </label>
        ))}
      </fieldset>

      {mode === "draw" ? (
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "relative rounded-xl border-[1.5px] border-dashed border-ink bg-sand",
              kind === "signature" ? "h-47.5" : "h-35",
            )}
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-5 bottom-8.5 border-b border-field-border"
            />
            <span
              aria-hidden="true"
              className="absolute bottom-9.5 left-5 text-base text-graphite"
            >
              ×
            </span>
            <SignaturePad
              ref={pad}
              strokes={strokes}
              onChange={setStrokes}
              label={`Pad to draw your ${noun} with a finger, stylus or mouse`}
              className="absolute inset-0 h-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs leading-snug text-graphite">
              Sign with your finger or a stylus. Turn the phone sideways for
              more room.
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={strokes.length === 0}
              onClick={() => setStrokes((all) => all.slice(0, -1))}
            >
              Undo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={strokes.length === 0}
              onClick={() => setStrokes([])}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor={inputId}
            className="flex h-30 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-ink bg-sand px-3 text-center has-focus-visible:outline-2 has-focus-visible:outline-ink"
          >
            {picked ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
                <img
                  src={picked.url}
                  alt={`Preview of your new ${noun}`}
                  className="max-h-18 max-w-full object-contain"
                />
                <span className="text-xs text-graphite">
                  {picked.file.name} · {Math.ceil(picked.file.size / 1024)} KB ·{" "}
                  {picked.width} × {picked.height} px
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold">Choose a PNG</span>
            )}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/png"
            className="sr-only"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </>
      )}

      {mode === "upload" && checks.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-4.5 shrink-0 items-center justify-center rounded-pill",
                  check.ok ? "bg-ink text-paper" : "text-signal",
                )}
              >
                {check.ok ? (
                  <CheckIcon size={10} strokeWidth={3.5} />
                ) : (
                  <AlertIcon size={18} />
                )}
              </span>
              <span className={cn(!check.ok && "font-semibold text-signal")}>
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-field bg-sand px-3 py-2.5 text-[13px] leading-normal text-graphite">
        {mode === "draw" &&
          "Saved as a PNG with a transparent background and checked like an upload. "}
        It becomes your active {noun}. The old one stays in History, so past
        records keep the {noun} used at the time.
      </p>
      {error && <InlineError live>{error}</InlineError>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!canSave} loading={saving} onClick={save}>
          Save as active
        </Button>
      </div>
    </Sheet>
  );
}
