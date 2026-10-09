import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { authErrorMessage } from "@/components/auth/authErrors";

/**
 * Clerk errors on Password & MFA, in plain words. Returns null when the
 * person closed "Confirm it's you" themselves — nothing to show then.
 * (On sign-in a wrong password gets a vaguer message so accounts can't be
 * guessed; here the person is already signed in, so we can be direct.)
 */
export function securityErrorMessage(error: unknown): string | null {
  if (isReverificationCancelledError(error)) return null;
  const code =
    error && typeof error === "object" && "errors" in error
      ? (error as { errors?: { code?: string }[] }).errors?.[0]?.code
      : undefined;
  if (code === "form_password_incorrect") {
    return "That password isn't right.";
  }
  return authErrorMessage(error);
}

/** Checks the new password before anything is sent to Clerk. */
export function checkNewPassword(fields: {
  current: string;
  next: string;
  repeat: string;
}): string | null {
  if (!fields.current || !fields.next || !fields.repeat) {
    return "Fill in all three fields.";
  }
  if (fields.next.length < 8) {
    return "The new password needs at least 8 characters.";
  }
  if (fields.next !== fields.repeat) return "The new passwords don't match.";
  if (fields.next === fields.current) {
    return "Choose a password that is different from your current one.";
  }
  return null;
}
