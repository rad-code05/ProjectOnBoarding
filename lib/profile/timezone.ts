import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { COMPANY_TIMEZONE } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** My profile → Timezone: my own choice (null = company) and the company one. */
export type TimezoneChoice = { own: string | null; company: string };

export async function loadTimezoneChoice(): Promise<TimezoneChoice> {
  const { userId } = await getCurrentUser();
  const supabase = createServerSupabaseClient();
  const [me, settings] = await Promise.all([
    supabase
      .from("app_users")
      .select("timezone")
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    supabase.from("app_settings").select("company_timezone").maybeSingle(),
  ]);
  return {
    own: me.data?.timezone ?? null,
    company: settings.data?.company_timezone ?? COMPANY_TIMEZONE,
  };
}
