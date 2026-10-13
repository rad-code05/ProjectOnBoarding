import "server-only";
import { cache } from "react";
import { COMPANY_TIMEZONE } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The timezone the signed-in person's screens use (F05e): their own choice
 * on My profile, else the company timezone. Asked once per request.
 */
export const displayTimezone = cache(async (): Promise<string> => {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("my_timezone");
  return !error && data ? data : COMPANY_TIMEZONE;
});

/**
 * The company timezone (D3, Admin → Settings): PDF, ticket years, reports
 * and the offboarding SLA use it, whatever the person's own choice.
 */
export const companyTimezone = cache(async (): Promise<string> => {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("company_timezone")
    .maybeSingle();
  return !error && data?.company_timezone
    ? data.company_timezone
    : COMPANY_TIMEZONE;
});
