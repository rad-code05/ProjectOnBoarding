"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { catalogErrorMessage } from "@/lib/admin/catalog-shared";
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

// ---------------------------------------------------------------------------
// Admin · Applications (F19c) — the database checks and audits every change.
// ---------------------------------------------------------------------------

const id = z.number().int().positive().max(32767);
const shortText = z.string().max(200);

async function rpcResult(
  run: PromiseLike<{ error: { code?: string; message?: string } | null }>,
): Promise<AdminResult> {
  const { error } = await run;
  if (error) {
    return {
      ok: false,
      message: catalogErrorMessage(error.code, error.message),
    };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Add (no id) or change an application. */
export async function saveApp(input: {
  id: number | null;
  categoryId: number;
  name: string;
  actions: string[];
  permissions: string[];
  multiple: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      id: id.nullable(),
      categoryId: id,
      name: shortText,
      actions: z.array(shortText).max(10),
      permissions: z.array(shortText).max(20),
      multiple: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the fields." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_save_app", {
      p_id: parsed.data.id as number,
      p_category_id: parsed.data.categoryId,
      p_name: parsed.data.name,
      p_actions: parsed.data.actions,
      p_permissions: parsed.data.permissions,
      p_multi_permission: parsed.data.multiple,
    }),
  );
}

/** Retire (false) or restore (true) an application. */
export async function setAppActive(input: {
  id: number;
  active: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown application." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_set_app_active", {
      p_id: parsed.data.id,
      p_active: parsed.data.active,
    }),
  );
}

/** Add (no id) or rename a category. */
export async function saveCategory(input: {
  id: number | null;
  name: string;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .object({ id: id.nullable(), name: shortText })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the name." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_save_category", {
      p_id: parsed.data.id as number,
      p_name: parsed.data.name,
    }),
  );
}

/** Retire (false) or restore (true) a category. */
export async function setCategoryActive(input: {
  id: number;
  active: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown category." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_set_category_active", {
      p_id: parsed.data.id,
      p_active: parsed.data.active,
    }),
  );
}

// ---------------------------------------------------------------------------
// Admin · Equipment & access types (F19d)
// ---------------------------------------------------------------------------

/** Add (no id) or change an equipment type. */
export async function saveEquipmentType(input: {
  id: number | null;
  name: string;
  actions: string[];
  needsDescription: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      id: id.nullable(),
      name: shortText,
      actions: z.array(shortText).max(10),
      needsDescription: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the fields." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_save_equipment_type", {
      p_id: parsed.data.id as number,
      p_name: parsed.data.name,
      p_actions: parsed.data.actions,
      p_needs_description: parsed.data.needsDescription,
    }),
  );
}

/** Retire (false) or restore (true) an equipment type. */
export async function setEquipmentTypeActive(input: {
  id: number;
  active: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown type." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_set_equipment_type_active", {
      p_id: parsed.data.id,
      p_active: parsed.data.active,
    }),
  );
}

/** Add (no id) or change a physical / logical access type. */
export async function saveAccessType(input: {
  id: number | null;
  name: string;
  actions: string[];
  scopes: string[];
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      id: id.nullable(),
      name: shortText,
      actions: z.array(shortText).max(10),
      scopes: z.array(shortText).max(20),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the fields." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_save_access_type", {
      p_id: parsed.data.id as number,
      p_name: parsed.data.name,
      p_actions: parsed.data.actions,
      p_scopes: parsed.data.scopes,
    }),
  );
}

/** Retire (false) or restore (true) an access type. */
export async function setAccessTypeActive(input: {
  id: number;
  active: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown type." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_set_access_type_active", {
      p_id: parsed.data.id,
      p_active: parsed.data.active,
    }),
  );
}

// ---------------------------------------------------------------------------
// Admin · Offices (F27b)
// ---------------------------------------------------------------------------

const cityId = z.number().int().positive().max(2147483647);

/** Add (no id) or change an office. */
export async function saveOffice(input: {
  id: number | null;
  name: string;
  city: string;
  country: string;
  usesRegions: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      id: id.nullable(),
      name: shortText,
      city: shortText,
      country: z.string().regex(/^[A-Z]{2}$/),
      usesRegions: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the fields." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_save_office", {
      p_id: parsed.data.id as number,
      p_name: parsed.data.name,
      p_city: parsed.data.city,
      p_country: parsed.data.country,
      p_uses_regions: parsed.data.usesRegions,
    }),
  );
}

/** Retire (false) or restore (true) an office. */
export async function setOfficeActive(input: {
  id: number;
  active: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown office." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_set_office_active", {
      p_id: parsed.data.id,
      p_active: parsed.data.active,
    }),
  );
}

/** Add (no id) or rename a city of an office in a state. */
export async function saveOfficeCity(input: {
  id: number | null;
  officeId: number;
  regionId: number;
  name: string;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z
    .object({
      id: cityId.nullable(),
      officeId: id,
      regionId: id,
      name: shortText,
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Choose a state and a name." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_save_office_city", {
      p_id: parsed.data.id as number,
      p_office_id: parsed.data.officeId,
      p_region_id: parsed.data.regionId,
      p_name: parsed.data.name,
    }),
  );
}

/** Retire (false) or restore (true) a city. */
export async function setOfficeCityActive(input: {
  id: number;
  active: boolean;
}): Promise<AdminResult> {
  await requireRole("admin");
  const parsed = z.object({ id: cityId, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown city." };
  const supabase = createServerSupabaseClient();
  return rpcResult(
    supabase.rpc("admin_set_office_city_active", {
      p_id: parsed.data.id,
      p_active: parsed.data.active,
    }),
  );
}
