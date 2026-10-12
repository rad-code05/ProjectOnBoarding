"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminResult = { ok: true } | { ok: false; message: string };

/**
 * Admin → Settings: the company timezone (D3). The database checks the name,
 * that the caller is an admin, and writes settings.timezone_changed.
 */
export async function setCompanyTimezone(input: {
  timezone: string;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/)
    .safeParse(input.timezone);
  if (!parsed.success) {
    return { ok: false, message: "Choose a timezone from the list." };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_company_timezone", {
    p_timezone: parsed.data,
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23514"
          ? "That timezone isn't known. Choose another one."
          : error.code === "42501"
            ? "Only an admin changes the company timezone."
            : "Could not save. Reload and try again.",
    };
  }
  // Screens of people without their own timezone follow it from now on.
  revalidatePath("/", "layout");
  return { ok: true };
}
