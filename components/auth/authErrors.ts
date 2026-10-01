/**
 * Turn a Clerk error into a short, safe message for the sign-in screens.
 * Wrong email and wrong password get the SAME message, so the page never
 * reveals which accounts exist.
 */

type ApiError = { code?: string; message?: string; longMessage?: string };

const GENERIC = "Something went wrong. Please try again.";
export const WRONG_CREDENTIALS = "Email or password is incorrect.";
export const WRONG_CODE = "That code isn't right. Check it and try again.";

function firstApiError(error: unknown): ApiError | undefined {
  if (!error || typeof error !== "object") return undefined;
  if (
    "errors" in error &&
    Array.isArray((error as { errors: unknown }).errors)
  ) {
    return (error as { errors: ApiError[] }).errors[0];
  }
  if ("code" in error || "message" in error) return error as ApiError;
  return undefined;
}

export function authErrorMessage(error: unknown): string {
  const first = firstApiError(error);
  if (!first) return GENERIC;

  switch (first.code) {
    case "form_identifier_not_found":
    case "form_password_incorrect":
    case "strategy_for_user_invalid":
      return WRONG_CREDENTIALS;
    case "form_code_incorrect":
    case "verification_failed":
      return WRONG_CODE;
    case "verification_expired":
      return "That code has expired. Send a new one.";
    case "form_password_pwned":
      return "This password has appeared in a data breach. Choose a different one.";
    case "form_password_length_too_short":
    case "form_password_size_in_bytes_exceeded":
    case "form_password_not_strong_enough":
      return first.longMessage ?? first.message ?? GENERIC;
    default:
      // e.g. too many attempts / account locked — Clerk's text is user-friendly.
      return first.longMessage ?? first.message ?? GENERIC;
  }
}
