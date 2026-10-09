import { createHash } from "node:crypto";
import sharp from "sharp";

export type SignatureKind = "signature" | "initials";

export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** Smallest acceptable image, so a signature stays readable on the PDF. */
export const MIN_SIZE: Record<
  SignatureKind,
  { width: number; height: number }
> = {
  signature: { width: 300, height: 100 },
  initials: { width: 60, height: 40 },
};

/** Largest stored image — bigger uploads are scaled down. */
const MAX_STORED = { width: 1200, height: 400 };

export type CleanPng =
  | {
      ok: true;
      data: Buffer;
      width: number;
      height: number;
      byteSize: number;
      sha256: string;
    }
  | { ok: false; message: string };

/**
 * Checks an uploaded signature / initials image and re-draws it as a fresh
 * PNG: PNG only, ≤ 1 MB, big enough to read; scaled down to at most
 * 1200 × 400; everything hidden in the file (metadata, extra chunks) is
 * dropped because sharp writes only the pixels.
 */
export async function cleanSignaturePng(
  input: Buffer,
  kind: SignatureKind,
): Promise<CleanPng> {
  if (input.byteLength === 0) {
    return { ok: false, message: "The file is empty." };
  }
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "The image is larger than 1 MB." };
  }
  try {
    // Untrusted input: fail on any warning, refuse absurd dimensions.
    const image = sharp(input, {
      failOn: "warning",
      limitInputPixels: 25_000_000,
    });
    const meta = await image.metadata();
    if (meta.format !== "png") {
      return { ok: false, message: "Only PNG images can be used." };
    }
    const min = MIN_SIZE[kind];
    if ((meta.width ?? 0) < min.width || (meta.height ?? 0) < min.height) {
      return {
        ok: false,
        message: `The image must be at least ${min.width} × ${min.height} px.`,
      };
    }
    const { data, info } = await image
      .resize(MAX_STORED.width, MAX_STORED.height, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      data,
      width: info.width,
      height: info.height,
      byteSize: info.size,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch {
    return { ok: false, message: "That file isn't a readable PNG image." };
  }
}
