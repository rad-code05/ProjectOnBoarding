import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Our palette replaces Tailwind's (`--color-*: initial` in globals.css), so
 * a class like `text-white` or `bg-black` produces no CSS at all — found
 * 2026-11-05: the batch filter pills showed black text on black. White is
 * `paper`, black is `ink` (design/tokens.md).
 */
const MISSING =
  /\b(?:text|bg|border|fill|stroke|ring|outline|decoration)-(?:white|black)\b/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the Laine palette", () => {
  test("no screen uses white / black classes the palette doesn't have", () => {
    const found = ["app", "components", "lib"].flatMap((dir) =>
      files(dir).flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(MISSING)].map(
          (m) => `${path}: ${m[0]}`,
        ),
      ),
    );
    expect(found).toEqual([]);
  });
});
