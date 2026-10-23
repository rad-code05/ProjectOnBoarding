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

/** The Supabase client request code works with (RLS applies). */
export type ServerSupabase = ReturnType<typeof createServerSupabaseClient>;

/**
 * The same client with a token fetched up front — for work that runs after
 * a Route Handler has returned (the assistant's tools run while the answer
 * streams). Clerk session tokens live about a minute: enough for one answer.
 */
export function createTokenSupabaseClient(
  token: string | null,
): ServerSupabase {
  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { accessToken: async () => token },
  );
}
