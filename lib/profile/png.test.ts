// @vitest-environment node
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { cleanSignaturePng } from "./png";

const image = (width: number, height: number, format: "png" | "jpeg" = "png") =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "hidden text" } } })
    [format]()
    .toBuffer();

describe("cleanSignaturePng", () => {
  test("re-draws a valid PNG and reports its size and fingerprint", async () => {
    const result = await cleanSignaturePng(await image(640, 200), "signature");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.width, result.height]).toEqual([640, 200]);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe("png");
    expect(meta.exif).toBeUndefined();
  });

  test("scales big images down to at most 1200 × 400", async () => {
    const result = await cleanSignaturePng(await image(2400, 400), "signature");
    expect(result.ok && [result.width, result.height]).toEqual([1200, 200]);
  });

  test("refuses other formats, tiny images and broken files", async () => {
    expect(
      await cleanSignaturePng(await image(640, 200, "jpeg"), "signature"),
    ).toEqual({
      ok: false,
      message: "Only PNG images can be used.",
    });
    expect(await cleanSignaturePng(await image(200, 80), "signature")).toEqual({
      ok: false,
      message: "The image must be at least 300 × 100 px.",
    });
    expect((await cleanSignaturePng(await image(200, 80), "initials")).ok).toBe(
      true,
    );
    expect(
      (await cleanSignaturePng(Buffer.from("not an image"), "signature")).ok,
    ).toBe(false);
  });

  test("refuses files over 1 MB before reading them", async () => {
    expect(
      await cleanSignaturePng(Buffer.alloc(1024 * 1024 + 1), "signature"),
    ).toEqual({ ok: false, message: "The image is larger than 1 MB." });
  });
});
