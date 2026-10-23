import { getCurrentUser } from "@/lib/auth";
import { runChat } from "@/lib/ai/chat-run";
import { chatStore } from "@/lib/ai/chat-store";
import { systemInstructions } from "@/lib/ai/system";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** A long answer with a few tool calls can take a while. */
export const maxDuration = 60;

/**
 * POST /api/chat — one question to the Laine assistant (F15c), answered as
 * a stream. Signed-in people with a role only; the database decides the
 * limits (ai_status) and RLS keeps every chat private.
 */
export async function POST(request: Request) {
  const { userId, roles } = await getCurrentUser();
  if (!roles.length) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const [timeZone, me, memory] = await Promise.all([
    companyTimezone(),
    supabase
      .from("app_users")
      .select("first_name")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    supabase.from("ai_memory").select("call_me").maybeSingle(),
  ]);
  const name = memory.data?.call_me || me.data?.first_name || "there";
  const now = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date());

  const body: unknown = await request.json().catch(() => null);
  return runChat(
    body,
    { userId, roles, timeZone },
    chatStore(systemInstructions({ name, roles, now, timeZone })),
  );
}
