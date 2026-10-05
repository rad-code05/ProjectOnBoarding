-- Local seed data (runs after migrations on `supabase db reset`).
--
-- Intentionally empty: this repository is public, so real people (Clerk IDs,
-- emails) never go in here. Real users are created by the Clerk webhook and
-- roles are bootstrapped with `pnpm users:sync` (reads .env.local).
-- pgTAP tests in supabase/tests create their own fake users.
select 1;
