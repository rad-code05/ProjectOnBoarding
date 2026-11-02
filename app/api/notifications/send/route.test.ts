import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runSender } = vi.hoisted(() => ({ runSender: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/run", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/notifications/run")
  >("@/lib/notifications/run");
  return { bearerMatches: actual.bearerMatches, runSender };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({}),
}));

const { POST } = await import("./route");
const request = (auth?: string) =>
  new Request("https://app.example/api/notifications/send", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });

describe("POST /api/notifications/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EMAIL_SENDER_SECRET", "s3cret-value");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stays closed when the secret is not set", async () => {
    vi.stubEnv("EMAIL_SENDER_SECRET", "");
    const res = await POST(request("Bearer "));
    expect(res.status).toBe(503);
    expect(runSender).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret without sending", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("Bearer wrong"))).status).toBe(401);
    expect((await POST(request("s3cret-value"))).status).toBe(401);
    expect(runSender).not.toHaveBeenCalled();
  });

  it("sends with the right secret, links pointing at this site", async () => {
    runSender.mockResolvedValue({
      mode: "everyone",
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    const res = await POST(request("Bearer s3cret-value"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1 });
    expect(runSender).toHaveBeenCalledWith("https://app.example");
  });

  it("answers 500 when the sender fails", async () => {
    runSender.mockRejectedValue(new Error("db down"));
    expect((await POST(request("Bearer s3cret-value"))).status).toBe(500);
  });
});
