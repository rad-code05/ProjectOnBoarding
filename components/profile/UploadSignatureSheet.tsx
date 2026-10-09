"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { uploadSignature } from "@/app/(app)/profile/actions";
import {
  AlertIcon,
  Button,
  CheckIcon,
  InlineError,
  Sheet,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type Kind = "signature" | "initials";

const MIN: Record<Kind, [number, number]> = {
  signature: [300, 100],
  initials: [60, 40],
};

type Picked = { file: File; url: string; width: number; height: number };

/**
 * Upload a new signature or initials PNG (design: Phone · Replace signature).
 * Quick checks happen here; the server checks and re-draws it again.
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

  const save = () =>
    picked &&
    start(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", picked.file);
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
      title={kind === "signature" ? "Replace signature" : "Upload initials"}
      onClose={onClose}
    >
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

      {checks.length > 0 && (
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
        It becomes your active {noun}. The old one stays in History, so past
        records keep the {noun} used at the time.
      </p>
      {error && <InlineError live>{error}</InlineError>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!allOk} loading={saving} onClick={save}>
          Save as active
        </Button>
      </div>
    </Sheet>
  );
}
