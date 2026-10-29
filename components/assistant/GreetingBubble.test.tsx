import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

let pathname = "/requests";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("./actions", () => ({ loadAssistantChat: vi.fn(async () => []) }));
vi.mock("@/app/(app)/requests/batch/actions", () => ({
  readBatchUpload: vi.fn(),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  deleteMyAssistantChats: vi.fn(),
}));

const { Assistant } = await import("./Assistant");

const favourite = { name: "Signature log", href: "/reports/signature-log" };

describe("the greeting bubble on the closed robot (board: Robot closed)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathname = "/requests";
  });

  test("offers their latest report by name, with Yes and Not now", () => {
    render(<Assistant name="Raju" roles={["admin"]} favourite={favourite} />);
    const bubble = screen.getByRole("status");
    expect(bubble).toHaveTextContent(
      /Good (morning|afternoon|evening), Raju\. Shall I open the Signature log again\?/,
    );
    expect(screen.getByRole("link", { name: "Yes, open it" })).toHaveAttribute(
      "href",
      "/reports/signature-log",
    );
  });

  test("Not now hides it for the rest of the day", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Assistant name="Raju" roles={["admin"]} favourite={favourite} />,
    );
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
    render(<Assistant name="Raju" roles={["admin"]} favourite={favourite} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("never on that report itself, and not without a favourite", () => {
    pathname = "/reports/signature-log";
    const { unmount } = render(
      <Assistant name="Raju" roles={["admin"]} favourite={favourite} />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
    pathname = "/requests";
    render(<Assistant name="Raju" roles={["admin"]} favourite={null} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
