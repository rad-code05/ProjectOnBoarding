"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export type UnsavedChange = { label: string; value: string };

/**
 * Shown when the request was saved from another tab or device after this
 * form was opened: nothing was overwritten; the person reloads, and can copy
 * what they typed first (design: Phone · Request form (changed elsewhere)).
 */
export function ChangedElsewhere({ changes }: { changes: UnsavedChange[] }) {
  const [copied, setCopied] = useState(false);
  const text = changes
    .map((change) => `${change.label}: ${change.value || "(empty)"}`)
    .join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border-2 border-signal bg-paper p-4 md:col-span-2"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="font-serif text-[21px] leading-tight">
          This request was changed somewhere else
        </h2>
        <p className="text-sm leading-normal">
          It was saved from another tab or device after you opened it. Your last
          change was not saved, so nothing is overwritten.
        </p>
      </div>
      {changes.length > 0 && (
        <div className="flex flex-col gap-1 rounded-field bg-sand px-3 py-2.5">
          <span className="text-xs font-semibold text-graphite">
            Your unsaved change{changes.length > 1 ? "s" : ""}
          </span>
          {changes.map((change) => (
            <span key={change.label} className="text-sm">
              <strong>{change.label}:</strong> {change.value || "(empty)"}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 md:flex-row">
        <Button onClick={() => window.location.reload()}>
          Load the latest version
        </Button>
        {changes.length > 0 && (
          <Button variant="secondary" onClick={copy}>
            {copied ? "Copied" : "Copy my change"}
          </Button>
        )}
      </div>
      <p className="text-xs leading-normal text-graphite">
        After loading, paste your change again if it is still needed. Every save
        is in the audit log.
      </p>
    </div>
  );
}
