import "server-only";
import { favouriteReportNames } from "@/lib/ai/memory";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { topRequestTypes } from "./assistant-memory-shared";

export type AssistantMemoryView = {
  callMe: string | null;
  /** "Signature log", newest first. */
  reports: string[];
  questions: string[];
  /** "Onboarding · Offboarding" — the request types they created most. */
  requestTypes: string[];
};

/**
 * My profile → What the assistant remembers (F15d-2d): the person's own
 * memory row (RLS: own row only) and the request types they start most —
 * counted from the requests they created, not stored.
 */
export async function loadAssistantMemory(
  userId: string,
): Promise<AssistantMemoryView> {
  const supabase = createServerSupabaseClient();
  const [memory, created] = await Promise.all([
    supabase
      .from("ai_memory")
      .select("call_me, favourite_reports, frequent_questions")
      .maybeSingle(),
    supabase
      .from("requests")
      .select("type")
      .eq("created_by", userId)
      .neq("state", "cancelled"),
  ]);
  return {
    callMe: memory.data?.call_me ?? null,
    reports: favouriteReportNames(memory.data?.favourite_reports ?? []),
    questions: memory.data?.frequent_questions ?? [],
    requestTypes: topRequestTypes((created.data ?? []).map((r) => r.type)),
  };
}
