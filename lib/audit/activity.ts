import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { activityEntries, type ActivityEntry } from "./timeline";

export type { ActivityEntry };

/**
 * Everything that happened to one request (request_activity()). The
 * database decides who may see it — approvers only on closed records — so
 * null means "not for you", and the page simply leaves the card out.
 */
export async function loadRequestActivity(
  requestId: string,
): Promise<ActivityEntry[] | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("request_activity", {
    p_request_id: requestId,
  });
  if (error) return null;
  return activityEntries(data ?? []);
}
