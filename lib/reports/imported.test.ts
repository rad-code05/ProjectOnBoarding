import { describe, expect, test } from "vitest";
import { importedNote, isImportedTicket, sourceWords } from "./imported";

describe("imported people in the reports (F24d-3)", () => {
  test("an IMP ticket is imported", () => {
    expect(isImportedTicket("IMP-2025-000004")).toBe(true);
    expect(isImportedTicket("UAM-2026-000004")).toBe(false);
    expect(isImportedTicket(null)).toBe(false);
    expect(sourceWords("IMP-2025-000004")).toBe("Imported");
    expect(sourceWords("UAM-2026-000004")).toBe("App");
  });

  test("the footnote counts them, and is absent without any", () => {
    expect(importedNote(0)).toBeNull();
    expect(importedNote(1)).toMatch(/^1 person here was imported/);
    expect(importedNote(3)).toMatch(/^3 people here were imported/);
  });
});
