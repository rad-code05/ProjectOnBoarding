import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyWebhook, applyClerkUserEvent } = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  applyClerkUserEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({}),
}));
vi.mock("@/lib/users/sync", () => ({ applyClerkUserEvent }));

const { POST } = await import("./route");
const request = () =>
  new Request("http://localhost/api/webhooks/clerk") as NextRequest;

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a request whose signature does not verify, without touching the database", async () => {
    verifyWebhook.mockRejectedValue(new Error("bad signature"));
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(applyClerkUserEvent).not.toHaveBeenCalled();
  });

  it("applies a verified event and returns 200", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.created", data: {} });
    applyClerkUserEvent.mockResolvedValue("upserted");
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(applyClerkUserEvent).toHaveBeenCalledOnce();
  });

  it("returns 500 when the sync fails, so Clerk retries", async () => {
    verifyWebhook.mockResolvedValue({ type: "user.created", data: {} });
    applyClerkUserEvent.mockRejectedValue(new Error("db down"));
    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
