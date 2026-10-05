import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { requiredEnv } from "./env";

/**
 * Supabase client for request code (pages, Server Actions, Route Handlers).
 * Every query carries the signed-in user's Clerk session token, so Postgres
 * Row Level Security decides what this user may read or write.
 * Server-only: the browser never talks to Supabase directly.
 */
export function createServerSupabaseClient() {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}
