"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { Button, SignOutIcon } from "@/components/ui";

/** Ends the Clerk session and returns to the sign-in page. */
export function SignOutButton() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      iconLeft={<SignOutIcon />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await signOut({ redirectUrl: "/sign-in" });
      }}
    >
      Sign out
    </Button>
  );
}
