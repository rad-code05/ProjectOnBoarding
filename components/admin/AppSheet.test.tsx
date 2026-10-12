import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminApp, AdminCategory } from "@/lib/admin/catalog-shared";
import { AppSheet } from "./AppSheet";

const saveApp = vi.fn();
const setAppActive = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  saveApp: (input: unknown) => saveApp(input),
  setAppActive: (input: unknown) => setAppActive(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  // jsdom has no modal dialogs; the Sheet only needs showModal to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});

const categories: AdminCategory[] = [
  { id: 1, name: "Core business", active: true },
  { id: 2, name: "Engineering, cloud & data", active: true },
  { id: 3, name: "Old stuff", active: false },
];
const figma: AdminApp = {
  id: 8,
  name: "Figma",
  categoryId: 1,
  actions: ["Grant", "Modify", "Remove"],
  permissions: ["Viewer", "Editor", "Admin"],
  active: true,
  uses: 12,
};

describe("AppSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveApp.mockResolvedValue({ ok: true });
    setAppActive.mockResolvedValue({ ok: true });
  });

  test("adds an application: name, category, actions, permissions", async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(
      <AppSheet
        app={null}
        categories={categories}
        defaultCategoryId={1}
        onClose={onClose}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Core business" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Old stuff/ }),
    ).not.toBeInTheDocument();
    await u.type(screen.getByLabelText("Name"), "Notion");
    await u.selectOptions(screen.getByLabelText("Category"), "2");
    await u.click(screen.getByRole("button", { name: "Modify" }));
    await u.type(
      screen.getByLabelText("New permission option"),
      "Member{Enter}",
    );
    await u.type(screen.getByLabelText("New permission option"), "Admin");
    await u.click(screen.getByRole("button", { name: "Add application" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveApp).toHaveBeenCalledWith({
      id: null,
      categoryId: 2,
      name: "Notion",
      actions: ["Grant", "Remove"],
      permissions: ["Member", "Admin"],
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("editing: a permission can be removed; renaming keeps old records", async () => {
    const u = userEvent.setup();
    render(
      <AppSheet
        app={figma}
        categories={categories}
        defaultCategoryId={1}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Applications · used on 12 requests"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/past requests and PDFs keep the name/),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Remove Editor" }));
    await u.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(saveApp).toHaveBeenCalledWith(
        expect.objectContaining({ id: 8, permissions: ["Viewer", "Admin"] }),
      ),
    );
  });

  test("retire explains what happens and asks the server", async () => {
    const u = userEvent.setup();
    render(
      <AppSheet
        app={figma}
        categories={categories}
        defaultCategoryId={1}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /The 12 requests that use it and their PDFs stay as they are/,
      ),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Retire application" }));
    await waitFor(() =>
      expect(setAppActive).toHaveBeenCalledWith({ id: 8, active: false }),
    );
  });

  test("a refusal from the database is shown", async () => {
    saveApp.mockResolvedValue({
      ok: false,
      message: "An application called Figma already exists.",
    });
    const u = userEvent.setup();
    render(
      <AppSheet
        app={null}
        categories={categories}
        defaultCategoryId={1}
        onClose={vi.fn()}
      />,
    );
    await u.type(screen.getByLabelText("Name"), "figma");
    await u.click(screen.getByRole("button", { name: "Add application" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An application called Figma already exists.",
    );
  });
});
