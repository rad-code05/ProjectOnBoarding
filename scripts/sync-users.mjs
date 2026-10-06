// Copies all Clerk users into app_users and grants the bootstrap roles.
//
//   pnpm users:sync            (reads .env.local)
//
// Needs CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and
// ROLE_BOOTSTRAP, e.g.
//   ROLE_BOOTSTRAP="admin@example.test=admin+requester+it_operator; approver@example.test=approver"
//
// Safe to run again: users are upserted, roles are only ADDED (never removed),
// and every change is written to the audit log by database triggers
// (source "system"). Real emails stay in .env.local — never in the repo.
import { createClient } from "@supabase/supabase-js";

const ROLES = ["admin", "requester", "it_operator", "approver", "auditor"];

function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
  return value;
}

function parseBootstrap(text) {
  const result = new Map();
  for (const part of text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [email, roleList] = part.split("=").map((s) => s?.trim());
    const roles = (roleList ?? "")
      .split("+")
      .map((r) => r.trim())
      .filter(Boolean);
    const unknown = roles.filter((r) => !ROLES.includes(r));
    if (!email || roles.length === 0 || unknown.length > 0) {
      console.error(
        `ROLE_BOOTSTRAP: cannot read "${part}" (roles: ${ROLES.join(", ")})`,
      );
      process.exit(1);
    }
    result.set(email.toLowerCase(), roles);
  }
  return result;
}

async function listClerkUsers(secretKey) {
  const users = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=100&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      },
    );
    if (!res.ok)
      throw new Error(`Clerk API ${res.status}: ${await res.text()}`);
    const page = await res.json();
    users.push(...page);
    if (page.length < 100) return users;
  }
}

function toAppUserRow(user) {
  const primary =
    user.email_addresses.find((e) => e.id === user.primary_email_address_id) ??
    user.email_addresses[0];
  if (!primary) return null;
  return {
    clerk_user_id: user.id,
    email: primary.email_address.trim().toLowerCase(),
    first_name: user.first_name,
    last_name: user.last_name,
    active: true,
  };
}

const bootstrap = parseBootstrap(env("ROLE_BOOTSTRAP"));
const supabase = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SECRET_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const rows = (await listClerkUsers(env("CLERK_SECRET_KEY")))
  .map(toAppUserRow)
  .filter(Boolean);
const { error: upsertError } = await supabase
  .from("app_users")
  .upsert(rows, { onConflict: "clerk_user_id" });
if (upsertError)
  throw new Error(`app_users upsert failed: ${upsertError.message}`);
console.log(`Synced ${rows.length} Clerk user(s) into app_users.`);

for (const [email, roles] of bootstrap) {
  const user = rows.find((r) => r.email === email);
  if (!user) {
    console.warn(
      `! ${email}: no Clerk user with this email — create/invite them in Clerk first.`,
    );
    continue;
  }
  const { error } = await supabase.from("user_roles").upsert(
    roles.map((role) => ({ clerk_user_id: user.clerk_user_id, role })),
    { onConflict: "clerk_user_id,role", ignoreDuplicates: true },
  );
  if (error)
    throw new Error(`user_roles for ${email} failed: ${error.message}`);
  console.log(`✓ ${email}: ${roles.join(", ")}`);
}
