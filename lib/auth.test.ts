import { beforeEach, describe, expect, it, vi } from "vitest";

const { protect, eq, redirect } = vi.hoisted(() => ({
  protect: vi.fn(),
  eq: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq }) }),
  }),
}));

const { getCurrentUser, requireRole } = await import("./auth");

function rolesInDb(roles: string[]) {
  eq.mockResolvedValue({ data: roles.map((role) => ({ role })), error: null });
}

describe("roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    protect.mockResolvedValue({ userId: "user_raju" });
  });

  it("reads the signed-in user's roles", async () => {
    rolesInDb(["admin", "it_operator"]);
    await expect(getCurrentUser()).resolves.toEqual({
      userId: "user_raju",
      roles: ["admin", "it_operator"],
    });
    expect(eq).toHaveBeenCalledWith("clerk_user_id", "user_raju");
  });

  it("allows a user who holds one of the roles", async () => {
    rolesInDb(["approver"]);
    await expect(requireRole("admin", "approver")).resolves.toMatchObject({
      roles: ["approver"],
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a user without the role to /no-access", async () => {
    rolesInDb(["approver"]);
    await expect(requireRole("admin")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/no-access");
  });

  it("sends a user with no roles (deactivated or not synced) to /no-access", async () => {
    rolesInDb([]);
    await expect(requireRole("approver")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/no-access");
  });

  it("fails loudly when roles cannot be loaded", async () => {
    eq.mockResolvedValue({ data: null, error: { message: "JWT invalid" } });
    await expect(getCurrentUser()).rejects.toThrow(/JWT invalid/);
  });

  it("requires sign-in first", async () => {
    protect.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(getCurrentUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(eq).not.toHaveBeenCalled();
  });
});
