import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DraftFormValues, SaveDraftResult } from "@/lib/requests/draft";
import { AUTOSAVE_DELAY_MS, useAutosave } from "./useAutosave";

const saveDraft = vi.fn<(input: unknown) => Promise<SaveDraftResult>>();
vi.mock("@/app/(app)/requests/actions", () => ({
  saveDraft: (input: unknown) => saveDraft(input),
}));

const values: DraftFormValues = {
  type: "onboarding",
  priority: "medium",
  assignee: "",
  first_name: "",
  last_name: "",
  work_email: "",
  job_title: "",
  department: "",
  country: "",
  manager_name: "",
  requestor_name: "",
  effective_date: "",
};

const setup = () =>
  renderHook(() =>
    useAutosave({
      id: "0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b",
      version: 1,
      values,
      savedAt: null,
      enabled: true,
    }),
  );

const ok = (version: number): SaveDraftResult => ({
  ok: true,
  version,
  savedAt: "2026-10-08T06:06:00Z",
});

/** Let the timer fire and the save promise settle. */
const pause = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
  });

beforeEach(() => {
  vi.useFakeTimers();
  saveDraft.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useAutosave", () => {
  test("nothing is saved until something changes", async () => {
    setup();
    await pause();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  test("saves once, 1.5 s after the last change, with the loaded version", async () => {
    saveDraft.mockResolvedValue(ok(2));
    const { result } = setup();
    act(() => result.current.setValue("first_name", "A"));
    act(() => result.current.setValue("first_name", "Anna"));
    await pause();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        values: expect.objectContaining({ first_name: "Anna" }),
      }),
    );
    expect(result.current.status).toEqual({ kind: "saved", at: "08:06" });
  });

  test("the next save uses the version the last save returned", async () => {
    saveDraft.mockResolvedValueOnce(ok(2)).mockResolvedValueOnce(ok(3));
    const { result } = setup();
    act(() => result.current.setValue("first_name", "Anna"));
    await pause();
    act(() => result.current.setValue("last_name", "Keller"));
    await pause();
    expect(saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 2 }),
    );
  });

  test("after a conflict nothing more is saved", async () => {
    saveDraft.mockResolvedValue({
      ok: false,
      reason: "conflict",
      message: "changed elsewhere",
    });
    const { result } = setup();
    act(() => result.current.setValue("first_name", "Anna"));
    await pause();
    expect(result.current.status.kind).toBe("conflict");
    act(() => result.current.setValue("first_name", "Anne"));
    await pause();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    // The unsaved value is still known, for "Copy my change".
    expect(result.current.values.first_name).toBe("Anne");
    expect(result.current.saved.first_name).toBe("");
  });

  test("invalid values show field errors and are not marked saved", async () => {
    saveDraft.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: { work_email: "Enter a valid email address." },
    });
    const { result } = setup();
    act(() => result.current.setValue("work_email", "anna@"));
    await pause();
    expect(result.current.status.kind).toBe("invalid");
    expect(result.current.errors.work_email).toBe(
      "Enter a valid email address.",
    );
  });
});
