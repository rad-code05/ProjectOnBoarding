"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as z from "zod";
import { usersErrorMessage } from "@/lib/admin/users-shared";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UsersResult = { ok: true } | { ok: false; message: string };

const roles = z
  .array(z.enum(["admin", "requester", "it_operator", "approver", "auditor"]))
  .max(5);
const userId = z.string().regex(/^user_\w+$/);

/**
 * Admin · Users & roles (F18b): set another person's roles. The database
 * refuses your own roles, an empty list and taking away the last active
 * approver / admin, and audits every role given or taken.
 */
export async function saveUserRoles(input: {
  userId: string;
  roles: string[];
}): Promise<UsersResult> {
  await requireRole("admin");
  const parsed = z.object({ userId, roles }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the roles." };
  if (parsed.data.roles.length === 0) {
    return {
      ok: false,
      message: "Choose at least one role — to remove everything, deactivate.",
    };
  }
  const { error } = await createServerSupabaseClient().rpc(
    "admin_set_user_roles",
    { p_user: parsed.data.userId, p_roles: parsed.data.roles },
  );
  if (error) {
    return { ok: false, message: usersErrorMessage(error.code, error.message) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invitations (F18c): the database checks first (a dry run), then Clerk sends
// the email, then the database records it — so a refused invitation never
// reaches anyone. The invitation link is never stored: Copy asks Clerk.
// ---------------------------------------------------------------------------

const invitationId = z.uuid();

/** Where the email's button leads: this app's Accept invitation page. */
async function acceptUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/accept-invitation`;
}

/** Clerk's refusal in words. */
function clerkMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    return `Clerk refused: ${first?.longMessage ?? first?.message ?? "unknown reason"}`;
  }
  return "Clerk could not be reached. Try again in a minute.";
}

async function sendClerkInvitation(email: string): Promise<string> {
  const client = await clerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress: email,
    redirectUrl: await acceptUrl(),
    expiresInDays: 7,
    notify: true,
  });
  return invitation.id;
}

/** Withdraws a Clerk invitation; already used / revoked is fine. */
async function revokeClerkInvitation(id: string) {
  try {
    const client = await clerkClient();
    await client.invitations.revokeInvitation(id);
  } catch (err) {
    console.warn(`Clerk invitation ${id} could not be revoked`, err);
  }
}

async function clerkIdOf(
  id: string,
): Promise<{ clerkId: string; email: string } | null> {
  const { data } = await createServerSupabaseClient()
    .from("user_invitations")
    .select("clerk_invitation_id, email")
    .eq("id", id)
    .maybeSingle();
  return data ? { clerkId: data.clerk_invitation_id, email: data.email } : null;
}

/** Invite a person: checked, emailed by Clerk (7 days), recorded, audited. */
export async function inviteUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}): Promise<UsersResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      email: z.string().trim().max(200),
      firstName: z.string().max(200),
      lastName: z.string().max(200),
      roles,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the fields." };
  const supabase = createServerSupabaseClient();
  const args = {
    p_email: parsed.data.email,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_roles: parsed.data.roles as (
      "admin" | "requester" | "it_operator" | "approver" | "auditor"
    )[],
  };
  const check = await supabase.rpc("admin_record_invitation", args);
  if (check.error) {
    return {
      ok: false,
      message: usersErrorMessage(check.error.code, check.error.message),
    };
  }
  let clerkId: string;
  try {
    clerkId = await sendClerkInvitation(parsed.data.email.toLowerCase());
  } catch (err) {
    return { ok: false, message: clerkMessage(err) };
  }
  const record = await supabase.rpc("admin_record_invitation", {
    ...args,
    p_clerk_invitation_id: clerkId,
  });
  if (record.error) {
    await revokeClerkInvitation(clerkId);
    return {
      ok: false,
      message: usersErrorMessage(record.error.code, record.error.message),
    };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Send again: Clerk's old invitation is withdrawn, a new one sent (7 days). */
export async function resendInvitation(input: {
  id: string;
}): Promise<UsersResult> {
  await requireRole("admin");
  const parsed = invitationId.safeParse(input.id);
  if (!parsed.success) return { ok: false, message: "Unknown invitation." };
  const supabase = createServerSupabaseClient();
  const check = await supabase.rpc("admin_resend_invitation", {
    p_id: parsed.data,
  });
  if (check.error) {
    return {
      ok: false,
      message: usersErrorMessage(check.error.code, check.error.message),
    };
  }
  const old = await clerkIdOf(parsed.data);
  if (!old) return { ok: false, message: "Unknown invitation." };
  await revokeClerkInvitation(old.clerkId);
  let clerkId: string;
  try {
    clerkId = await sendClerkInvitation(old.email);
  } catch (err) {
    return { ok: false, message: clerkMessage(err) };
  }
  const record = await supabase.rpc("admin_resend_invitation", {
    p_id: parsed.data,
    p_clerk_invitation_id: clerkId,
  });
  if (record.error) {
    await revokeClerkInvitation(clerkId);
    return {
      ok: false,
      message: usersErrorMessage(record.error.code, record.error.message),
    };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Withdraw: recorded first (no role from it any more), then revoked in Clerk. */
export async function withdrawInvitation(input: {
  id: string;
}): Promise<UsersResult> {
  await requireRole("admin");
  const parsed = invitationId.safeParse(input.id);
  if (!parsed.success) return { ok: false, message: "Unknown invitation." };
  const old = await clerkIdOf(parsed.data);
  const { error } = await createServerSupabaseClient().rpc(
    "admin_withdraw_invitation",
    {
      p_id: parsed.data,
    },
  );
  if (error)
    return { ok: false, message: usersErrorMessage(error.code, error.message) };
  if (old) await revokeClerkInvitation(old.clerkId);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * The invitation link, asked from Clerk when needed (never stored) — for when
 * the email didn't arrive. Copying it is audited.
 */
export async function invitationLink(input: {
  id: string;
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { userId: me } = await requireRole("admin");
  const parsed = invitationId.safeParse(input.id);
  if (!parsed.success) return { ok: false, message: "Unknown invitation." };
  const inv = await clerkIdOf(parsed.data);
  if (!inv) return { ok: false, message: "Unknown invitation." };
  let url: string | undefined;
  try {
    const client = await clerkClient();
    const { data } = await client.invitations.getInvitationList({
      query: inv.email,
      status: "pending",
    });
    url = data.find((i) => i.id === inv.clerkId)?.url;
  } catch (err) {
    return { ok: false, message: clerkMessage(err) };
  }
  if (!url) {
    return {
      ok: false,
      message: "Clerk has no open link for this invitation — send it again.",
    };
  }
  await createServerSupabaseClient()
    .from("audit_events")
    .insert({
      actor_id: me,
      action: "user.invitation_link_copied",
      entity: "user_invitation",
      entity_id: parsed.data,
      source: "user",
      diff: { email: inv.email },
    });
  return { ok: true, url };
}
