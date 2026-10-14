"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import * as z from "zod";
import {
  clearAccessSchema,
  saveOtherSchema,
  setAccessSchema,
  type AccessResult,
  type SaveOtherResult,
} from "@/lib/requests/access";
import {
  draftValuesSchema,
  fieldErrorsOf,
  saveDraftSchema,
  toColumns,
  type DraftFormValues,
  type SaveDraftResult,
} from "@/lib/requests/draft";
import {
  changeStateSchema,
  saveExecutionSchema,
} from "@/lib/requests/execution";
import {
  saveEquipmentSchema,
  setPhysicalSchema,
} from "@/lib/requests/equipment";
import {
  heldChangeSchema,
  keepHeldSchema,
  type HeldKind,
} from "@/lib/requests/access-change";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";
import type { TablesInsert } from "@/lib/supabase/database.types";

/** New request → an empty onboarding draft, then its form. */
export async function createDraft() {
  const { userId } = await requireRole("admin", "requester");
  const supabase = createServerSupabaseClient();
  // Ticket ID/year/number and the form version are set by the database
  // (trigger request_before_insert); the generated types can't know that.
  const draft = { created_by: userId } as TablesInsert<"requests">;
  const { data, error } = await supabase
    .from("requests")
    .insert(draft)
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the request: ${error.message}`);
  redirect(`/requests/${data.id}`);
}

/**
 * "Who is leaving?" (F09c): a new offboarding draft for the person (or an
 * empty one), pre-filled by the database from their access inventory. Goes
 * to the draft on success; otherwise says why.
 */
export async function startOffboarding(input: {
  employeeId: string | null;
}): Promise<{ ok: false; message: string }> {
  await requireRole("admin", "requester");
  const parsed = z.object({ employeeId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a person first." };
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_offboarding", {
    p_employee_id: parsed.data.employeeId ?? undefined,
  });
  if (error || !data) {
    if (error?.code === "23514" || error?.code === "23505") {
      return {
        ok: false,
        message:
          "An offboarding is already open for this person — find it in the Requests list.",
      };
    }
    if (error?.code === "42501") {
      return { ok: false, message: "You can't start an offboarding." };
    }
    return {
      ok: false,
      message:
        "Could not start the offboarding. Check your connection and try again.",
    };
  }
  redirect(`/requests/${data}`);
}

/**
 * "Who is changing?" (F10b): a new access-change draft for a person on
 * record (section 2 from their last closed request, nothing pre-filled), or
 * an empty one for someone not in the app yet; opens it.
 */
export async function startAccessChange(input: {
  employeeId: string | null;
}): Promise<{ ok: false; message: string }> {
  await requireRole("admin", "requester");
  const parsed = z.object({ employeeId: z.uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a person first." };
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_access_modification", {
    p_employee_id: parsed.data.employeeId ?? undefined,
  });
  if (error || !data) {
    if (error?.code === "23514") {
      return {
        ok: false,
        message: error.message.includes("leaving")
          ? "This person is leaving — an offboarding is open for them."
          : "An access change is already open for this person — find it in the Requests list.",
      };
    }
    if (error?.code === "42501") {
      return { ok: false, message: "You can't start an access change." };
    }
    return {
      ok: false,
      message:
        "Could not start the access change. Check your connection and try again.",
    };
  }
  redirect(`/requests/${data}`);
}

/**
 * Saves the form's values — only if the request still has the version the
 * form was loaded with (optimistic locking). Otherwise nothing is written and
 * the form says it was changed somewhere else. The audit log entry is written
 * by the database trigger.
 */
export async function saveDraft(input: {
  id: string;
  version: number;
  values: DraftFormValues;
}): Promise<SaveDraftResult> {
  await requireRole("admin", "requester", "it_operator");

  const target = saveDraftSchema.safeParse(input);
  if (!target.success) {
    return { ok: false, reason: "error", message: "This request is unknown." };
  }
  const values = draftValuesSchema.safeParse(input.values);
  if (!values.success) {
    return {
      ok: false,
      reason: "invalid",
      fieldErrors: fieldErrorsOf(values.error),
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("requests")
    .update(toColumns(values.data, await companyTimezone()))
    .eq("id", target.data.id)
    .eq("version", target.data.version)
    .select("version, updated_at")
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      reason: "error",
      message: "Could not save. Check your connection and try again.",
    };
  }
  if (!data) {
    return {
      ok: false,
      reason: "conflict",
      message:
        "This request was changed somewhere else (another tab or device), so your change was not saved. Reload to see the latest version.",
    };
  }
  return { ok: true, version: data.version, savedAt: data.updated_at };
}

/** Database refusals → words for the person (the database has the last say). */
function accessError(code: string | undefined): {
  ok: false;
  message: string;
} {
  if (code === "23514") {
    return { ok: false, message: "That option isn't offered for this app." };
  }
  if (code === "42501") {
    return { ok: false, message: "This request can't be changed any more." };
  }
  return {
    ok: false,
    message: "Could not save. Check your connection and try again.",
  };
}

/**
 * Section 5: sets one app's action / permission / notes on a request. The
 * database checks them against that app's own options and keeps a copy of
 * the app name; every change is audited by a trigger.
 */
export async function setAccess(input: {
  requestId: string;
  appId: number;
  action: string;
  permission: string | null;
  notes: string | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = setAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That choice isn't valid." };
  }
  const { requestId, appId, action, permission, notes } = parsed.data;
  const supabase = createServerSupabaseClient();

  const existing = await supabase
    .from("request_access_items")
    .select("id")
    .eq("request_id", requestId)
    .eq("app_id", appId)
    .maybeSingle();
  if (existing.error) return accessError(existing.error.code);

  const { error } = existing.data
    ? await supabase
        .from("request_access_items")
        .update({ action, permission, notes })
        .eq("id", existing.data.id)
    : await supabase.from("request_access_items").insert(
        // App name and category are copied from the catalog by the database
        // (trigger access_item_before_write); the types can't know that.
        {
          request_id: requestId,
          app_id: appId,
          action,
          permission,
          notes,
        } as TablesInsert<"request_access_items">,
      );
  return error ? accessError(error.code) : { ok: true };
}

/** Section 5 "Clear": the app is no longer part of this request (audited). */
export async function clearAccess(input: {
  requestId: string;
  appId: number;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = clearAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown app." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("request_access_items")
    .delete()
    .eq("request_id", parsed.data.requestId)
    .eq("app_id", parsed.data.appId);
  return error ? accessError(error.code) : { ok: true };
}

/** Database refusals on an access change: its messages are written for people. */
function heldError(error: { code?: string; message: string }): AccessResult {
  if (error.code === "23514") {
    const message =
      error.message.charAt(0).toUpperCase() + error.message.slice(1);
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  if (error.code === "42501") {
    return { ok: false, message: "This request can't be changed any more." };
  }
  return {
    ok: false,
    message: "Could not save. Check your connection and try again.",
  };
}

/**
 * Access change (F10c): change or remove one item the person holds — one
 * line per held item, pointing to its inventory row. The database checks the
 * item is still held, that a change picks something different, and keeps
 * what they had on a removal (audited by the item triggers).
 */
export async function setHeldChange(input: {
  requestId: string;
  kind: HeldKind;
  inventoryId: string;
  action: string;
  value: string | null;
  notes: string | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = heldChangeSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That choice isn't valid." };
  const { requestId, kind, inventoryId, action, value, notes } = parsed.data;
  const supabase = createServerSupabaseClient();

  const held = await supabase
    .from("employee_access_inventory")
    .select("app_id, name, equipment_type_id, access_type_id")
    .eq("id", inventoryId)
    .maybeSingle();
  if (held.error || !held.data) {
    return {
      ok: false,
      message: "That item isn't held any more — reload the request.",
    };
  }
  const item = held.data;

  if (kind === "application") {
    const existing = await supabase
      .from("request_access_items")
      .select("id")
      .eq("request_id", requestId)
      .eq("inventory_id", inventoryId)
      .maybeSingle();
    if (existing.error) return heldError(existing.error);
    const { error } = existing.data
      ? await supabase
          .from("request_access_items")
          .update({ action, permission: value, notes })
          .eq("id", existing.data.id)
      : await supabase.from("request_access_items").insert({
          request_id: requestId,
          inventory_id: inventoryId,
          app_id: item.app_id,
          // The database copies the catalog name; an "Other" app keeps its own.
          app_name: item.name,
          action,
          permission: value,
          notes,
        } as TablesInsert<"request_access_items">);
    return error ? heldError(error) : { ok: true };
  }

  if (kind === "equipment") {
    const existing = await supabase
      .from("request_equipment_items")
      .select("id")
      .eq("request_id", requestId)
      .eq("inventory_id", inventoryId)
      .maybeSingle();
    if (existing.error) return heldError(existing.error);
    const { error } = existing.data
      ? await supabase
          .from("request_equipment_items")
          .update({ action, notes })
          .eq("id", existing.data.id)
      : await supabase.from("request_equipment_items").insert({
          request_id: requestId,
          inventory_id: inventoryId,
          // Type, asset tag and description are copied from the inventory.
          type_id: item.equipment_type_id,
          action,
          notes,
        } as TablesInsert<"request_equipment_items">);
    return error ? heldError(error) : { ok: true };
  }

  const existing = await supabase
    .from("request_physical_access_items")
    .select("id")
    .eq("request_id", requestId)
    .eq("inventory_id", inventoryId)
    .maybeSingle();
  if (existing.error) return heldError(existing.error);
  const { error } = existing.data
    ? await supabase
        .from("request_physical_access_items")
        .update({ action, scope: value, notes })
        .eq("id", existing.data.id)
    : await supabase.from("request_physical_access_items").insert({
        request_id: requestId,
        inventory_id: inventoryId,
        type_id: item.access_type_id,
        action,
        scope: value,
        notes,
      } as TablesInsert<"request_physical_access_items">);
  return error ? heldError(error) : { ok: true };
}

/** Access change: keep a held item as it is — its line goes (audited). */
export async function keepHeld(input: {
  requestId: string;
  kind: HeldKind;
  inventoryId: string;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = keepHeldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown item." };
  const { requestId, kind, inventoryId } = parsed.data;
  const supabase = createServerSupabaseClient();
  const table =
    kind === "application"
      ? "request_access_items"
      : kind === "equipment"
        ? "request_equipment_items"
        : "request_physical_access_items";
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("request_id", requestId)
    .eq("inventory_id", inventoryId);
  return error ? heldError(error) : { ok: true };
}

/** Section 5 "Add other application": adds or changes a one-off app (audited). */
export async function saveOther(input: {
  requestId: string;
  itemId: string | null;
  name: string;
  action: string;
  permission: string | null;
  notes: string | null;
}): Promise<SaveOtherResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = saveOtherSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Give the application a name and an action." };
  }
  const { requestId, itemId, name, action, permission, notes } = parsed.data;
  const supabase = createServerSupabaseClient();
  const { data, error } = itemId
    ? await supabase
        .from("request_access_items")
        .update({ app_name: name, action, permission, notes })
        .eq("id", itemId)
        .eq("request_id", requestId)
        .is("app_id", null)
        .select("id")
        .single()
    : await supabase
        .from("request_access_items")
        .insert(
          // The category ("Other") is set by the database trigger.
          {
            request_id: requestId,
            app_name: name,
            action,
            permission,
            notes,
          } as TablesInsert<"request_access_items">,
        )
        .select("id")
        .single();
  if (error?.code === "23505") {
    return { ok: false, message: `${name} is already on this request.` };
  }
  if (error) return accessError(error.code);
  return { ok: true, id: data.id };
}

/** Removes a one-off app from the request (audited). */
export async function removeOther(input: {
  requestId: string;
  itemId: string;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = z
    .object({ requestId: z.uuid(), itemId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown app." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("request_access_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .eq("request_id", parsed.data.requestId)
    .is("app_id", null);
  return error ? accessError(error.code) : { ok: true };
}

/** Section 6: adds or changes one piece of equipment (audited). */
export async function saveEquipment(input: {
  requestId: string;
  itemId: string | null;
  typeId: number;
  action: string;
  description: string | null;
  assetTag: string | null;
  notes: string | null;
}): Promise<SaveOtherResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = saveEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Choose a type and an action." };
  }
  const { requestId, itemId, typeId, action, description, assetTag, notes } =
    parsed.data;
  const values = {
    type_id: typeId,
    action,
    description,
    asset_tag: assetTag,
    notes,
  };
  const supabase = createServerSupabaseClient();
  const { data, error } = itemId
    ? await supabase
        .from("request_equipment_items")
        .update(values)
        .eq("id", itemId)
        .eq("request_id", requestId)
        .select("id")
        .single()
    : await supabase
        .from("request_equipment_items")
        // The type name is copied by the database (trigger).
        .insert({
          request_id: requestId,
          ...values,
        } as TablesInsert<"request_equipment_items">)
        .select("id")
        .single();
  if (error?.code === "23514") {
    return {
      ok: false,
      message: "Check the type, action and description (Other needs one).",
    };
  }
  if (error) return accessError(error.code);
  return { ok: true, id: data.id };
}

/** Section 6: removes one piece of equipment from the request (audited). */
export async function removeEquipment(input: {
  requestId: string;
  itemId: string;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = z
    .object({ requestId: z.uuid(), itemId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown item." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("request_equipment_items")
    .delete()
    .eq("id", parsed.data.itemId)
    .eq("request_id", parsed.data.requestId);
  return error ? accessError(error.code) : { ok: true };
}

/** Section 7: sets one access type's action / scope / notes (audited). */
export async function setPhysical(input: {
  requestId: string;
  typeId: number;
  action: string;
  scope: string | null;
  notes: string | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = setPhysicalSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That choice isn't valid." };
  const { requestId, typeId, action, scope, notes } = parsed.data;
  const supabase = createServerSupabaseClient();
  const existing = await supabase
    .from("request_physical_access_items")
    .select("id")
    .eq("request_id", requestId)
    .eq("type_id", typeId)
    .maybeSingle();
  if (existing.error) return accessError(existing.error.code);
  const { error } = existing.data
    ? await supabase
        .from("request_physical_access_items")
        .update({ action, scope, notes })
        .eq("id", existing.data.id)
    : await supabase.from("request_physical_access_items").insert({
        request_id: requestId,
        type_id: typeId,
        action,
        scope,
        notes,
      } as TablesInsert<"request_physical_access_items">);
  return error ? accessError(error.code) : { ok: true };
}

/** Section 7 "Clear": the access type is no longer on the request (audited). */
export async function clearPhysical(input: {
  requestId: string;
  typeId: number;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = z
    .object({ requestId: z.uuid(), typeId: z.int().positive() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown access type." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("request_physical_access_items")
    .delete()
    .eq("request_id", parsed.data.requestId)
    .eq("type_id", parsed.data.typeId);
  return error ? accessError(error.code) : { ok: true };
}

/**
 * Start execution or cancel — through the database's state machine
 * (transition_request), which checks the move, the role and the reason,
 * stamps the server time and writes the audit event.
 */
export async function changeState(input: {
  requestId: string;
  to: "in_execution" | "cancelled";
  reason: string | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = changeStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That step isn't valid." };
  const { requestId, to, reason } = parsed.data;
  if (to === "cancelled" && !reason) {
    return { ok: false, message: "Give a reason for cancelling." };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("transition_request", {
    p_request_id: requestId,
    p_to: to,
    p_reason: reason ?? undefined,
  });
  if (!error) return { ok: true };
  if (error.code === "23514") {
    // A rule the database explains in words (e.g. the offboarding SLA);
    // only a move that no longer fits the state asks for a reload.
    if (error.message.startsWith("a request cannot go from")) {
      return {
        ok: false,
        message:
          "This step isn't possible any more — reload to see where the request is now.",
      };
    }
    const text = error.message.charAt(0).toUpperCase() + error.message.slice(1);
    return { ok: false, message: text.endsWith(".") ? text : `${text}.` };
  }
  if (error.code === "42501") {
    return { ok: false, message: "You can't take this step on this request." };
  }
  return {
    ok: false,
    message: "Could not save. Check your connection and try again.",
  };
}

/** Section 9: saves the checklist and notes ("executed by" = you, set by the database). */
export async function saveExecution(input: {
  requestId: string;
  checks: Record<string, boolean | "not_needed" | "no_change">;
  notes: string | null;
}): Promise<AccessResult> {
  const { userId } = await requireRole("admin", "requester", "it_operator");
  const parsed = saveExecutionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Those notes are too long." };
  }
  const { requestId, checks, notes } = parsed.data;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("execution_confirmations")
    .upsert(
      { request_id: requestId, checks, notes, executed_by: userId },
      { onConflict: "request_id" },
    );
  if (!error) return { ok: true };
  if (error.code === "42501") {
    return {
      ok: false,
      message:
        "Section 9 can only be changed while the request is in execution.",
    };
  }
  return accessError(error.code);
}

/** Offboarding work (F09d): the database's own words for a refusal it explains. */
function workError(error: { code?: string; message: string }): AccessResult {
  if (error.code === "23514" || error.code === "P0002") {
    // check_violation messages are written for people ("choose Delete, …").
    const message =
      error.message.charAt(0).toUpperCase() + error.message.slice(1);
    return {
      ok: false,
      message: message.endsWith(".") ? message : `${message}.`,
    };
  }
  if (error.code === "42501") {
    return { ok: false, message: "You can't record offboarding work." };
  }
  return {
    ok: false,
    message: "Could not save. Check your connection and try again.",
  };
}

const setRemovalSchema = z.object({
  kind: z.enum(["application", "access"]),
  itemId: z.uuid(),
  done: z.boolean().nullable(),
  method: z.enum(["Delete", "Suspend", "Disable"]).nullable(),
});

/** Section 5 / 7 of an offboarding: how it was removed, and the tick (server time). */
export async function setRemoval(input: {
  kind: "application" | "access";
  itemId: string;
  done: boolean | null;
  method: "Delete" | "Suspend" | "Disable" | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = setRemovalSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That change isn't valid." };
  const { kind, itemId, done, method } = parsed.data;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_removal", {
    p_kind: kind,
    p_item_id: itemId,
    p_done: done ?? undefined,
    p_method: method ?? undefined,
  });
  return error ? workError(error) : { ok: true };
}

const equipmentReturnSchema = z.object({
  itemId: z.uuid(),
  status: z.enum(["pending", "received", "not_returned"]),
  reason: z
    .string()
    .trim()
    .max(500, "Keep it under 500 characters.")
    .nullable()
    .transform((value) => value || null),
});

/** Section 6 of an offboarding: pending / received / not returned (+ reason). */
export async function setEquipmentReturn(input: {
  itemId: string;
  status: "pending" | "received" | "not_returned";
  reason: string | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = equipmentReturnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "That change isn't valid.",
    };
  }
  if (parsed.data.status === "not_returned" && !parsed.data.reason) {
    return { ok: false, message: "Say why it was not returned." };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_equipment_return", {
    p_item_id: parsed.data.itemId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? undefined,
  });
  return error ? workError(error) : { ok: true };
}

/** Handover: mailbox converted to a shared mailbox, or no mailbox to convert. */
export async function setMailboxHandling(input: {
  requestId: string;
  value: "converted_shared" | "no_mailbox" | null;
}): Promise<AccessResult> {
  await requireRole("admin", "requester", "it_operator");
  const parsed = z
    .object({
      requestId: z.uuid(),
      value: z.enum(["converted_shared", "no_mailbox"]).nullable(),
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "That change isn't valid." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_mailbox_handling", {
    p_request_id: parsed.data.requestId,
    // null clears the choice; the generated types can't say a text argument may be null.
    p_value: parsed.data.value as string,
  });
  return error ? workError(error) : { ok: true };
}
