import { describe, expect, test } from "vitest";
import { authErrorMessage, WRONG_CODE, WRONG_CREDENTIALS } from "./authErrors";

const apiError = (code: string, longMessage?: string) => ({
  errors: [{ code, message: "msg", longMessage }],
});

describe("authErrorMessage", () => {
  test("wrong email and wrong password give the same message", () => {
    expect(authErrorMessage(apiError("form_identifier_not_found"))).toBe(
      WRONG_CREDENTIALS,
    );
    expect(authErrorMessage(apiError("form_password_incorrect"))).toBe(
      WRONG_CREDENTIALS,
    );
  });

  test("a wrong verification code has its own message", () => {
    expect(authErrorMessage(apiError("form_code_incorrect"))).toBe(WRONG_CODE);
  });

  test("breached passwords are explained", () => {
    expect(authErrorMessage(apiError("form_password_pwned"))).toMatch(
      /data breach/,
    );
  });

  test("other errors use Clerk's long message", () => {
    expect(
      authErrorMessage(apiError("too_many_requests", "Too many attempts.")),
    ).toBe("Too many attempts.");
  });

  test("unknown or empty errors fall back to a generic message", () => {
    expect(authErrorMessage(null)).toMatch(/Something went wrong/);
    expect(authErrorMessage("boom")).toMatch(/Something went wrong/);
  });
});
