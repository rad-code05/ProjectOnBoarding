import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { requiredEnv } from "./env";

/**
 * Supabase client with the SECRET key — bypasses Row Level Security.
 *
 * Only for code that has no signed-in user and has proven where the request
 * came from: the Clerk webhook (after its signature is verified). Never use it
 * in pages or Server Actions — use createServerSupabaseClient() there.
 */
export function createAdminSupabaseClient() {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
