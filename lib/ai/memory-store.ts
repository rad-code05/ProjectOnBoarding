import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { addRecent } from "./memory";

/**
 * Updates the asking person's own memory row (`ai_memory`, RLS: own row
 * only) with the person's own client. Memory is a convenience: a failure is
 * logged and never breaks an answer.
 */

type Change = {
  callMe?: string;
  report?: string;
  question?: string;
};

export async function remember(
  db: ServerSupabase,
  userId: string,
  change: Change,
): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("ai_memory")
      .select("call_me, favourite_reports, frequent_questions")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = {
      user_id: userId,
      call_me: change.callMe ?? data?.call_me ?? null,
      favourite_reports: change.report
        ? addRecent(data?.favourite_reports ?? [], change.report)
        : (data?.favourite_reports ?? []),
      frequent_questions: change.question
        ? addRecent(data?.frequent_questions ?? [], change.question)
        : (data?.frequent_questions ?? []),
    };
    const saved = await db
      .from("ai_memory")
      .upsert(row, { onConflict: "user_id" });
    if (saved.error) throw new Error(saved.error.message);
    return true;
  } catch (error) {
    console.error("Could not update the assistant memory", error);
    return false;
  }
}
