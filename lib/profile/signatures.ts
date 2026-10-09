import "server-only";
import { formatDay } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SignatureKind } from "./png";

export const SIGNATURE_BUCKET = "signatures";

/** One version of the signed-in person's signature or initials. */
export type SignatureVersion = {
  id: string;
  kind: SignatureKind;
  source: "png" | "typed";
  typedText: string | null;
  /** "Signature · v2", "Initials · typed “RB”". */
  label: string;
  /** "Uploaded 30 Sep 2026 · 640 × 200 px". */
  detail: string;
  status: "active" | "kept" | "replaced";
  /** Short-lived link to the private image (current versions only). */
  previewUrl: string | null;
};

export type SignatureState = {
  versions: SignatureVersion[];
  signature: SignatureVersion | null;
  initials: SignatureVersion | null;
};

/**
 * The signed-in person's own signature versions (RLS: own rows only), with
 * short-lived links to the current images in the private bucket.
 */
export async function loadSignatures(): Promise<SignatureState> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("signature_assets")
    .select(
      "id, kind, source, storage_path, typed_text, width, height, is_active, created_at, retired_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load signatures: ${error.message}`);

  const current = data.filter((row) => !row.retired_at && row.storage_path);
  const links = new Map<string, string>();
  if (current.length > 0) {
    const signed = await supabase.storage
      .from(SIGNATURE_BUCKET)
      .createSignedUrls(
        current.map((row) => row.storage_path as string),
        10 * 60,
      );
    for (const item of signed.data ?? []) {
      if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
    }
  }

  const counter: Record<string, number> = {};
  const versions = data
    .map((row): SignatureVersion => {
      const kind = row.kind as SignatureKind;
      const name = kind === "signature" ? "Signature" : "Initials";
      counter[kind] = (counter[kind] ?? 0) + 1;
      const typed = row.source === "typed";
      return {
        id: row.id,
        kind,
        source: row.source as "png" | "typed",
        typedText: row.typed_text,
        label: typed
          ? `${name} · typed “${row.typed_text}”`
          : `${name} · v${counter[kind]}`,
        detail: [
          `${typed ? "Saved" : "Uploaded"} ${formatDay(row.created_at)}`,
          !typed && `${row.width} × ${row.height} px`,
        ]
          .filter(Boolean)
          .join(" · "),
        status: row.is_active ? "active" : row.retired_at ? "replaced" : "kept",
        previewUrl: row.storage_path
          ? (links.get(row.storage_path) ?? null)
          : null,
      };
    })
    .reverse();

  const latest = (kind: SignatureKind) =>
    versions.find((v) => v.kind === kind && v.status !== "replaced") ?? null;
  return {
    versions,
    signature: latest("signature"),
    initials: latest("initials"),
  };
}
