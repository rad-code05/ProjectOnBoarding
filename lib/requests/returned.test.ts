import { describe, expect, test } from "vitest";
import {
  firstFlagged,
  flagLabel,
  flaggedSections,
  type ReturnInfo,
} from "./returned";

const info = (flagged: number[]): ReturnInfo => ({
  byName: "Moises Larez",
  byFirstName: "Moises",
  atLabel: "9 Oct 2026, 14:30",
  comment: "Figma should be Viewer",
  flagged,
});

describe("returned", () => {
  test("flagged sections are sorted, unique and only real sections", () => {
    expect(flaggedSections([9, 5, 5, 0, 12, 2])).toEqual([2, 5, 9]);
  });

  test("Go to jumps to the first flagged section", () => {
    expect(firstFlagged(info([5, 9]))?.title).toBe("Application access");
    expect(firstFlagged(info([]))).toBeNull();
  });

  test("only flagged sections say who flagged them", () => {
    expect(flagLabel(info([5]), 5)).toBe("Flagged by Moises");
    expect(flagLabel(info([5]), 6)).toBeNull();
    expect(flagLabel(null, 5)).toBeNull();
  });
});
