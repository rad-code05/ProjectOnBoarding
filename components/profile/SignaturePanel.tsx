"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  activateSignature,
  saveTypedInitials,
} from "@/app/(app)/profile/actions";
import { Button, InlineError } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  SignatureState,
  SignatureVersion,
} from "@/lib/profile/signatures";
import { UploadSignatureSheet } from "./UploadSignatureSheet";

const STATUS: Record<
  SignatureVersion["status"],
  { label: string; style: string }
> = {
  active: { label: "Active", style: "bg-ink text-paper" },
  kept: { label: "Kept", style: "bg-sand text-graphite" },
  replaced: { label: "Replaced", style: "bg-sand text-graphite" },
};

/**
 * "Signature & initials" and "History" on My profile (design: Phone · My
 * profile). Only your own versions are ever shown (the database allows
 * nothing else).
 */
export function SignaturePanel({ state }: { state: SignatureState }) {
  const router = useRouter();
  const initialsId = useId();
  const [sheet, setSheet] = useState<"signature" | "initials" | null>(null);
  const [initials, setInitials] = useState(state.initials?.typedText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      setError(null);
      router.refresh();
    });

  const card = (version: SignatureVersion | null) =>
    cn(
      "flex flex-col gap-2.5 rounded-xl p-3.5",
      version?.status === "active"
        ? "border-2 border-ink"
        : "border border-field-border",
    );

  const radio = (version: SignatureVersion | null, label: string) => (
    <label className="flex min-h-8 items-center gap-2.5">
      <input
        type="radio"
        name="sign-with"
        disabled={!version || pending}
        checked={version?.status === "active"}
        onChange={() =>
          version && run(() => activateSignature({ assetId: version.id }))
        }
        className="size-5 accent-ink"
      />
      <span className="flex-1 text-[15px] font-bold">{label}</span>
      {version?.status === "active" && (
        <span className="rounded-pill bg-ink px-2.5 py-0.5 text-[11px] font-bold text-paper">
          Active
        </span>
      )}
    </label>
  );

  return (
    <>
      <section
        aria-labelledby="sig-title"
        className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="sig-title" className="font-serif text-[21px]">
            Signature &amp; initials
          </h2>
          <p className="text-[13px] leading-normal text-graphite">
            An internal record that you carried out or approved the process —
            not a legal e-signature. Applied only by you, after you confirm,
            with the server date and time.
          </p>
        </div>
        {error && <InlineError live>{error}</InlineError>}

        <fieldset className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
          <legend className="pb-2 text-xs font-semibold">Sign with</legend>

          <div className={card(state.signature)}>
            {radio(state.signature, "Signature")}
            <div className="flex h-24 items-center justify-center rounded-field bg-sand p-2">
              {state.signature?.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived private link
                <img
                  src={state.signature.previewUrl}
                  alt="Your current signature"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-sm text-graphite">No signature yet</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-xs text-graphite">
                {state.signature?.detail ?? "PNG, at least 300 × 100 px"}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-haspopup="dialog"
                onClick={() => setSheet("signature")}
              >
                {state.signature ? "Replace" : "Upload"}
              </Button>
            </div>
          </div>

          <div className={card(state.initials)}>
            {radio(state.initials, "Initials")}
            {state.initials?.source === "png" && state.initials.previewUrl ? (
              <div className="flex h-12 items-center justify-center rounded-field bg-sand p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private link */}
                <img
                  src={state.initials.previewUrl}
                  alt="Your current initials"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : null}
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <label htmlFor={initialsId} className="sr-only">
                Initials (up to 4 characters)
              </label>
              <input
                id={initialsId}
                value={initials}
                maxLength={4}
                autoComplete="off"
                onChange={(event) => setInitials(event.target.value)}
                placeholder="RB"
                className="h-12 min-w-0 rounded-field border border-field-border px-3 text-base outline-none focus:border-ink md:h-10 md:text-sm"
              />
              <span
                aria-hidden="true"
                className="flex h-12 w-20 items-center justify-center rounded-field bg-sand font-accent text-[28px] italic md:h-10"
              >
                {initials.trim() || "—"}
              </span>
              <Button
                variant="secondary"
                size="sm"
                loading={pending}
                disabled={
                  !initials.trim() ||
                  initials.trim() === state.initials?.typedText
                }
                onClick={() => run(() => saveTypedInitials({ text: initials }))}
              >
                Save
              </Button>
            </div>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet("initials")}
              className="self-start text-[13px] font-semibold underline underline-offset-[3px]"
            >
              or draw or upload your initials
            </button>
          </div>
        </fieldset>
      </section>

      <section
        aria-labelledby="hist-title"
        className="flex flex-col gap-1.5 rounded-card border border-line bg-paper pt-4 pb-1.5"
      >
        <h2 id="hist-title" className="px-4 pb-1.5 font-serif text-[21px]">
          History
        </h2>
        {state.versions.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-graphite">
            Nothing yet — upload a signature or save your initials.
          </p>
        ) : (
          <ul className="border-t border-line-subtle">
            {state.versions.map((version) => (
              <li
                key={version.id}
                className="flex items-center gap-3 border-b border-line-subtle px-4 py-3"
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">
                    {version.label}
                  </span>
                  <span className="text-xs text-graphite">
                    {version.detail}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-pill px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap",
                    STATUS[version.status].style,
                  )}
                >
                  {STATUS[version.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 pt-1 pb-2.5 text-xs leading-normal text-graphite">
          Replacing keeps old versions, so past records and PDFs still show the
          signature used at the time.
        </p>
      </section>

      {sheet && (
        <UploadSignatureSheet kind={sheet} onClose={() => setSheet(null)} />
      )}
    </>
  );
}
