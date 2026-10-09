"use client";

import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui";

/** QR code for the authenticator app, with the key to type in by hand. */
export function AuthenticatorQr({
  uri,
  secret,
}: {
  uri: string | null;
  secret: string | null;
}) {
  return (
    <>
      {uri && (
        <div className="self-start rounded-card border border-line bg-paper p-4">
          <QRCodeSVG
            value={uri}
            size={176}
            bgColor="#ffffff"
            fgColor="#000000"
            title="QR code for your authenticator app"
          />
        </div>
      )}
      {secret && (
        <details className="text-[13px] text-graphite">
          <summary className="cursor-pointer font-semibold text-ink">
            Can&apos;t scan? Enter the key manually
          </summary>
          <code className="mt-2 block rounded-field bg-paper px-3 py-2 font-mono text-sm break-all text-ink">
            {secret}
          </code>
        </details>
      )}
    </>
  );
}

function download(codes: string[], email: string) {
  const text = [
    "Laine onboarding rights — backup codes",
    `Account: ${email}`,
    "Each code works once. Keep this file somewhere safe.",
    "",
    ...codes,
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "laine-onboarding-backup-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/** New backup codes: list, download, and "I've saved them" before going on. */
export function BackupCodeList({
  codes,
  email,
  saved,
  onSavedChange,
}: {
  codes: string[];
  email: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  return (
    <>
      <ol
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-2 rounded-card border border-line bg-paper p-4 font-mono text-sm"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <Button
        variant="secondary"
        onClick={() => download(codes, email)}
        className="self-start"
      >
        Download as text file
      </Button>
      <label className="flex items-start gap-3 rounded-field bg-paper p-3 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => onSavedChange(e.target.checked)}
          className="mt-0.5 size-4 accent-ink"
        />
        I&apos;ve saved my backup codes somewhere safe.
      </label>
    </>
  );
}
