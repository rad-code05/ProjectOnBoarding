// @vitest-environment node
import { APICallError } from "ai";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { testError, testModel } = await import("./test-model");

const apiError = (statusCode: number) =>
  new APICallError({
    message: "x",
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode,
  });

describe("Test the model", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("Anthropic's refusals in plain words", () => {
    expect(testError(apiError(404))).toMatch(/doesn't know this model ID/);
    expect(testError(apiError(401))).toMatch(/refused the API key/);
    expect(testError(apiError(529))).toMatch(/busy/);
    expect(testError(new Error("boom"))).toMatch(/didn't work/);
  });

  test("without a key: says so, calls nobody", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_FAKE_MODEL", "");
    expect(await testModel("claude-x")).toEqual({
      ok: false,
      message: "The Anthropic API key isn't set in the server settings.",
    });
  });

  test("the fake model (CI) answers", async () => {
    vi.stubEnv("AI_FAKE_MODEL", "1");
    vi.stubEnv("VERCEL", "");
    expect(await testModel("claude-x")).toMatchObject({ ok: true });
  });
});
