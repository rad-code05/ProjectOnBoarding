import "server-only";
import { personName } from "@/lib/requests/labels";
import { formatDay } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone, displayTimezone } from "@/lib/time/display";
import { monthStart, zonedParts } from "@/lib/time/zoned";
import type { AiSettingsView } from "./ai-shared";

/**
 * Admin → AI settings (F15e-1, board Phone · Admin · AI settings): the
 * settings row, every model (retired ones too), usage this month and who
 * changed it last. Admin only — ai_usage_this_month() checks again.
 */
export async function loadAiSettings(): Promise<AiSettingsView> {
  const supabase = createServerSupabaseClient();
  const [settings, models, usage, tz, companyTz] = await Promise.all([
    supabase
      .from("ai_settings")
      .select(
        "enabled, model, monthly_budget_usd, hourly_limit, updated_by, updated_at, editor:app_users!ai_settings_updated_by_fkey(first_name, last_name)",
      )
      .maybeSingle(),
    supabase
      .from("ai_models")
      .select("id, name, model_id, note, price_in, price_out, active")
      .order("sort_order")
      .order("id"),
    supabase.rpc("ai_usage_this_month").maybeSingle(),
    displayTimezone(),
    companyTimezone(),
  ]);
  if (settings.error || !settings.data) {
    throw new Error("Could not load the AI settings.");
  }
  const s = settings.data;
  // The budget starts again on the 1st of next month, company time.
  const first = monthStart(companyTz);
  const next = new Date(first);
  next.setUTCDate(next.getUTCDate() + 40);
  const nextFirst = `${zonedParts(next.toISOString(), companyTz).date.slice(0, 7)}-01`;
  return {
    enabled: s.enabled,
    model: s.model,
    budget: Number(s.monthly_budget_usd),
    hourly: s.hourly_limit,
    models: (models.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      modelId: m.model_id,
      note: m.note,
      priceIn: Number(m.price_in),
      priceOut: Number(m.price_out),
      active: m.active,
    })),
    usage: {
      spent: Number(usage.data?.spent_usd ?? 0),
      answers: usage.data?.answers ?? 0,
      people: usage.data?.people ?? 0,
    },
    resetsOn: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${nextFirst}T00:00:00Z`)),
    lastChanged: s.updated_by
      ? `${personName(s.editor?.first_name, s.editor?.last_name) || "An admin"} · ${formatDay(s.updated_at, tz)}`
      : null,
  };
}
