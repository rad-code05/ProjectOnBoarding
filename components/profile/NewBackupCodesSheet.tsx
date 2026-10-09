"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { useState } from "react";
import { recordSecurityChange } from "@/app/(app)/profile/security/actions";
import { BackupCodeList } from "@/components/auth/MfaPieces";
import { Button, InlineError, Sheet } from "@/components/ui";
import { useReverifyPrompt } from "./ReverifySheet";
import { securityErrorMessage } from "./securityErrors";

/** Make new backup codes; the old ones stop working. */
export function NewBackupCodesSheet({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const reverify = useReverifyPrompt();
  const createBackupCode = useReverification(() => user!.createBackupCode(), {
    onNeedsReverification: reverify.onNeeds,
  });

  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    setBusy(true);
    try {
      const backup = await createBackupCode();
      setCodes(backup.codes);
      await recordSecurityChange("backup_codes_regenerated");
    } catch (err) {
      setError(securityErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        eyebrow="Backup codes"
        title="Make new backup codes"
        onClose={onClose}
      >
        {codes ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-graphite">
              Your new backup codes. The old ones no longer work. Each code lets
              you sign in once.
            </p>
            <BackupCodeList
              codes={codes}
              email={user?.primaryEmailAddress?.emailAddress ?? ""}
              saved={saved}
              onSavedChange={setSaved}
            />
            <Button disabled={!saved} onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-graphite">
              New codes replace all your current ones — any codes you saved
              before stop working.
            </p>
            {error && <InlineError live>{error}</InlineError>}
            <div className="flex flex-col gap-2 md:flex-row-reverse">
              <Button loading={busy} onClick={make}>
                Make new codes
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Sheet>
      {reverify.prompt}
    </>
  );
}
