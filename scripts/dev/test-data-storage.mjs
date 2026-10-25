// DEV ONLY — removes every PDF record file from the private "records"
// bucket, together with test-data-clean.sql (which removes their rows).
// Files go through the Storage API (deleting storage rows in SQL would
// leave the files behind). Signature images (bucket "signatures") are kept.
//
//   node --env-file=.env.local scripts/dev/test-data-storage.mjs          (dry run)
//   node --env-file=.env.local scripts/dev/test-data-storage.mjs --yes    (delete)
//
// Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. NEVER on production.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed.",
  );
const db = createClient(url, key, { auth: { persistSession: false } });

// Guard: only a dev / test database holds the e2e test accounts.
const { count, error: guard } = await db
  .from("app_users")
  .select("clerk_user_id", { count: "exact", head: true })
  .like("email", "e2e.%+clerk\\_test@%");
if (guard) throw guard;
if (!count)
  throw new Error(
    "No e2e test accounts here — refusing: this may be production.",
  );

const bucket = db.storage.from("records");
const files = [];
const { data: folders, error } = await bucket.list("", { limit: 1000 });
if (error) throw error;
for (const f of folders) {
  if (f.id) {
    files.push(f.name);
    continue;
  }
  // A folder (<ticket>/): its files.
  const { data: inside, error: e2 } = await bucket.list(f.name, {
    limit: 1000,
  });
  if (e2) throw e2;
  for (const g of inside) files.push(`${f.name}/${g.name}`);
}

console.log(
  `${new URL(url).host}: ${files.length} PDF record file(s) in "records".`,
);
if (!process.argv.includes("--yes")) {
  console.log("Dry run — add --yes to delete them.");
  process.exit(0);
}
for (let i = 0; i < files.length; i += 100) {
  const { error: e3 } = await bucket.remove(files.slice(i, i + 100));
  if (e3) throw e3;
}
console.log(`Deleted ${files.length} file(s).`);
