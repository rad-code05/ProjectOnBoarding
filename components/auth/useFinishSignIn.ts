"use client";

import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Activate the new session after a successful sign-in.
 * If Clerk still needs something from the user (e.g. first-time MFA setup),
 * go to /session-tasks; otherwise go to the start page.
 */
export function useFinishSignIn() {
  const { signIn } = useSignIn();
  const router = useRouter();

  return useCallback(async () => {
    const { error } = await signIn.finalize({
      navigate: async ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          router.push("/session-tasks");
          return;
        }
        const url = decorateUrl("/");
        if (url.startsWith("http")) window.location.href = url;
        else router.push(url);
      },
    });
    return error;
  }, [signIn, router]);
}
