import { describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { applyClerkUserEvent, toSyncArgs, type ClerkUserData } from "./sync";

const clerkUser: ClerkUserData = {
  id: "user_123",
  first_name: "Ada",
  last_name: "Lovelace",
  primary_email_address_id: "idn_2",
  email_addresses: [
    { id: "idn_1", email_address: "old@example.test" },
    { id: "idn_2", email_address: "  Ada@Example.TEST " },
  ],
};

/** Minimal fake of the Supabase query builder calls we use. */
function fakeSupabase(error: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  const rpc = vi.fn().mockResolvedValue({ data: "updated", error });
  return { client: { from, rpc } as never, from, rpc, update, eq };
}

const event = (type: string, data: unknown) =>
  ({ type, data }) as unknown as WebhookEvent;

describe("toSyncArgs", () => {
  it("uses the primary email, trimmed and in lower case", () => {
    expect(toSyncArgs(clerkUser)).toEqual({
      p_clerk_user_id: "user_123",
      p_email: "ada@example.test",
      p_first_name: "Ada",
      p_last_name: "Lovelace",
      p_banned: false,
    });
  });

  it("falls back to the first email when no primary is set", () => {
    const args = toSyncArgs({ ...clerkUser, primary_email_address_id: null });
    expect(args.p_email).toBe("old@example.test");
  });

  it("banned in Clerk is passed on (= deactivated, F18a)", () => {
    expect(toSyncArgs({ ...clerkUser, banned: true }).p_banned).toBe(true);
  });

  it("rejects a user without an email", () => {
    expect(() => toSyncArgs({ ...clerkUser, email_addresses: [] })).toThrow(
      /no email/,
    );
  });
});

describe("applyClerkUserEvent", () => {
  it.each(["user.created", "user.updated"])(
    "syncs the user through sync_clerk_user() on %s",
    async (type) => {
      const db = fakeSupabase();
      await expect(
        applyClerkUserEvent(db.client, event(type, clerkUser)),
      ).resolves.toBe("updated");
      expect(db.rpc).toHaveBeenCalledWith(
        "sync_clerk_user",
        expect.objectContaining({
          p_clerk_user_id: "user_123",
          p_email: "ada@example.test",
        }),
      );
      expect(db.from).not.toHaveBeenCalled();
    },
  );

  it("deactivates (never deletes) on user.deleted", async () => {
    const db = fakeSupabase();
    await expect(
      applyClerkUserEvent(
        db.client,
        event("user.deleted", { id: "user_123", deleted: true }),
      ),
    ).resolves.toBe("deactivated");
    expect(db.update).toHaveBeenCalledWith({ active: false });
    expect(db.eq).toHaveBeenCalledWith("clerk_user_id", "user_123");
  });

  it("ignores other events", async () => {
    const db = fakeSupabase();
    await expect(
      applyClerkUserEvent(db.client, event("session.created", {})),
    ).resolves.toBe("ignored");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("throws when the database write fails (so Clerk retries)", async () => {
    const db = fakeSupabase({ message: "boom" });
    await expect(
      applyClerkUserEvent(db.client, event("user.created", clerkUser)),
    ).rejects.toThrow(/boom/);
  });
});
