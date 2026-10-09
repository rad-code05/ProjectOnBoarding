"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth";
import { cleanSignaturePng } from "@/lib/profile/png";
import { SIGNATURE_BUCKET } from "@/lib/profile/signatures";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";

export type ProfileResult = { ok: true } | { ok: false; message: string };

const failed = (message: string): ProfileResult => ({ ok: false, message });

/**
 * Upload your own signature or initials PNG. The server re-draws it (sharp),
 * stores it in YOUR folder of the private bucket and adds a new version,
 * which becomes the active one (the database retires the previous one).
 */
export async function uploadSignature(
  formData: FormData,
): Promise<ProfileResult> {
  const { userId } = await getCurrentUser();
  const kind = z
    .enum(["signature", "initials"])
    .safeParse(formData.get("kind"));
  const file = formData.get("file");
  if (!kind.success || !(file instanceof File)) {
    return failed("Choose a PNG image first.");
  }
  if (file.size > 1024 * 1024) return failed("The image is larger than 1 MB.");

  const clean = await cleanSignaturePng(
    Buffer.from(await file.arrayBuffer()),
    kind.data,
  );
  if (!clean.ok) return failed(clean.message);

  const supabase = createServerSupabaseClient();
  const path = `${userId}/${randomUUID()}.png`;
  const upload = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, clean.data, { contentType: "image/png", upsert: false });
  if (upload.error) {
    return failed("Could not store the image. Try again in a moment.");
  }

  const { error } = await supabase.from("signature_assets").insert({
    user_id: userId,
    kind: kind.data,
    source: "png",
    storage_path: path,
    width: clean.width,
    height: clean.height,
    byte_size: clean.byteSize,
    sha256: clean.sha256,
  } satisfies TablesInsert<"signature_assets">);
  if (error) return failed("Could not save the new version. Try again.");
  revalidatePath("/profile");
  return { ok: true };
}

const initialsSchema = z
  .string()
  .trim()
  .min(1, "Type 1 to 4 characters.")
  .max(4, "Type 1 to 4 characters.");

/** Typed initials (1–4 characters) become a new, active initials version. */
export async function saveTypedInitials(input: {
  text: string;
}): Promise<ProfileResult> {
  const { userId } = await getCurrentUser();
  const text = initialsSchema.safeParse(input.text);
  if (!text.success) return failed(text.error.issues[0].message);
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("signature_assets").insert({
    user_id: userId,
    kind: "initials",
    source: "typed",
    typed_text: text.data,
  } satisfies TablesInsert<"signature_assets">);
  if (error) return failed("Could not save your initials. Try again.");
  revalidatePath("/profile");
  return { ok: true };
}

/** "Sign with": make one of your current versions the active one. */
export async function activateSignature(input: {
  assetId: string;
}): Promise<ProfileResult> {
  await getCurrentUser();
  const id = z.uuid().safeParse(input.assetId);
  if (!id.success) return failed("Unknown signature.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_active_signature", {
    p_asset_id: id.data,
  });
  if (error) return failed("Could not switch. Reload and try again.");
  revalidatePath("/profile");
  return { ok: true };
}
