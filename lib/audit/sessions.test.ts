import { describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { isSessionEvent, logClerkSessionEvent } from "./sessions";

function fakeSupabase(error: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

const session = {
  id: "sess_1",
  user_id: "user_123",
  client_id: "client_9",
  status: "active",
};
const event = (type: string, data: unknown = session) =>
  ({ type, data }) as unknown as WebhookEvent;

describe("isSessionEvent", () => {
  it("accepts the four session events and nothing else", () => {
    for (const type of [
      "session.created",
      "session.ended",
      "session.removed",
      "session.revoked",
    ]) {
      expect(isSessionEvent(event(type))).toBe(true);
    }
    expect(isSessionEvent(event("user.created"))).toBe(false);
    expect(isSessionEvent(event("session.pending"))).toBe(false);
  });
});

describe("logClerkSessionEvent", () => {
  it("writes a sign-in to the audit log in the user's name", async () => {
    const db = fakeSupabase();
    const evt = event("session.created");
    if (!isSessionEvent(evt)) throw new Error("not a session event");
    await expect(logClerkSessionEvent(db.client, evt, "msg_1")).resolves.toBe(
      "logged",
    );
    expect(db.from).toHaveBeenCalledWith("audit_events");
    expect(db.insert).toHaveBeenCalledWith({
      actor_id: "user_123",
      action: "session.created",
      entity: "session",
      entity_id: "sess_1",
      source: "user",
      diff: { status: "active", client_id: "client_9", webhook_id: "msg_1" },
    });
  });

  it("marks a revoked session as a system action", async () => {
    const db = fakeSupabase();
    const evt = event("session.revoked", { ...session, status: "revoked" });
    if (!isSessionEvent(evt)) throw new Error("not a session event");
    await logClerkSessionEvent(db.client, evt, null);
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "system",
        diff: { status: "revoked", client_id: "client_9" },
      }),
    );
  });

  it("throws when the insert fails, so the webhook returns 500 and Clerk retries", async () => {
    const db = fakeSupabase({ message: "permission denied" });
    const evt = event("session.ended");
    if (!isSessionEvent(evt)) throw new Error("not a session event");
    await expect(logClerkSessionEvent(db.client, evt, null)).rejects.toThrow(
      /permission denied/,
    );
  });
});
