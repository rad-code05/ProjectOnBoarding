import { describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { applyClerkUserEvent, toAppUserRow, type ClerkUserData } from "./sync";

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
  const upsert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ upsert, update });
  return { client: { from } as never, from, upsert, update, eq };
}

const event = (type: string, data: unknown) =>
  ({ type, data }) as unknown as WebhookEvent;

describe("toAppUserRow", () => {
  it("uses the primary email, trimmed and in lower case", () => {
    expect(toAppUserRow(clerkUser)).toEqual({
      clerk_user_id: "user_123",
      email: "ada@example.test",
      first_name: "Ada",
      last_name: "Lovelace",
      active: true,
    });
  });

  it("falls back to the first email when no primary is set", () => {
    const row = toAppUserRow({ ...clerkUser, primary_email_address_id: null });
    expect(row.email).toBe("old@example.test");
  });

  it("rejects a user without an email", () => {
    expect(() => toAppUserRow({ ...clerkUser, email_addresses: [] })).toThrow(
      /no email/,
    );
  });
});

describe("applyClerkUserEvent", () => {
  it.each(["user.created", "user.updated"])(
    "upserts the user on %s",
    async (type) => {
      const db = fakeSupabase();
      await expect(
        applyClerkUserEvent(db.client, event(type, clerkUser)),
      ).resolves.toBe("upserted");
      expect(db.from).toHaveBeenCalledWith("app_users");
      expect(db.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          clerk_user_id: "user_123",
          email: "ada@example.test",
        }),
        { onConflict: "clerk_user_id" },
      );
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
