import { describe, expect, it } from "vitest";
import {
  DEFAULT_FROM,
  isTestAccountEmail,
  senderAddress,
  sendMode,
} from "./policy";

describe("sendMode", () => {
  it("sends nothing without a Resend key — emails wait", () => {
    expect(sendMode({ VERCEL_ENV: "production" }).mode).toBe("off");
  });

  it("never sends from a preview site", () => {
    expect(sendMode({ RESEND_API_KEY: "re_x", VERCEL_ENV: "preview" })).toEqual(
      { mode: "off", reason: "Preview sites never send emails." },
    );
  });

  it("sends to everyone in production", () => {
    expect(
      sendMode({ RESEND_API_KEY: "re_x", VERCEL_ENV: "production" }).mode,
    ).toBe("everyone");
  });

  it("emails the test accounts only anywhere else (local, CI)", () => {
    expect(sendMode({ RESEND_API_KEY: "re_x" }).mode).toBe("test_accounts");
    expect(
      sendMode({ RESEND_API_KEY: "re_x", VERCEL_ENV: "development" }).mode,
    ).toBe("test_accounts");
  });
});

describe("isTestAccountEmail", () => {
  it("knows the browser-test accounts", () => {
    expect(isTestAccountEmail("e2e.admin+clerk_test@laine.ai")).toBe(true);
    expect(isTestAccountEmail("E2E.Approver+clerk_test@laine.ai")).toBe(true);
  });

  it("refuses everyone else", () => {
    expect(isTestAccountEmail("rbh@laine.ai")).toBe(false);
    expect(isTestAccountEmail("rbh+approver@laine.ai")).toBe(false);
    expect(isTestAccountEmail("x.e2e.admin+clerk_test@laine.ai")).toBe(false);
  });
});

describe("senderAddress", () => {
  it("uses no-reply@access-notify.laine.ai unless EMAIL_FROM is set", () => {
    expect(senderAddress({})).toBe(DEFAULT_FROM);
    expect(senderAddress({ EMAIL_FROM: " Test <t@example.com> " })).toBe(
      "Test <t@example.com>",
    );
  });
});
