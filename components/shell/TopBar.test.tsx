import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TopBar } from "./TopBar";

const signOut = vi.fn();
let pathname = "/requests";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut }) }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const adminItems = [
  { href: "/requests", label: "Requests" },
  { href: "/reports", label: "Reports" },
  { href: "/audit", label: "Audit log" },
  { href: "/admin", label: "Admin" },
];

function renderBar() {
  render(
    <TopBar
      items={adminItems}
      userName="Raju Bholani"
      userRole="Admin · IT operator"
    />,
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    signOut.mockReset();
    pathname = "/requests";
  });

  test("shows the menu it is given, in order", () => {
    renderBar();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = Array.from(nav.querySelectorAll("a")).map(
      (a) => a.textContent,
    );
    expect(links).toEqual(["Requests", "Reports", "Audit log", "Admin"]);
  });

  test("marks the current page, also on sub-pages", () => {
    pathname = "/admin/users";
    renderBar();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Requests" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("shows the user and links to My profile", () => {
    renderBar();
    expect(
      screen.getByRole("link", { name: "My profile: Raju Bholani" }),
    ).toHaveAttribute("href", "/profile");
    expect(screen.getByText("Admin · IT operator")).toBeInTheDocument();
  });

  test("signs out to /sign-in", async () => {
    renderBar();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in" });
  });
});

describe("TopBar phone menu", () => {
  beforeEach(() => {
    signOut.mockReset();
    pathname = "/reports";
  });

  test("opens a full menu with the role's pages and marks the current one", async () => {
    renderBar();
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("phone-menu")).toBeNull();

    await userEvent.setup().click(button);

    const menu = document.getElementById("phone-menu")!;
    const links = within(menu)
      .getByRole("navigation", { name: "Main" })
      .querySelectorAll("a");
    expect(Array.from(links).map((a) => a.textContent)).toEqual([
      "Requests",
      "Reports",
      "Audit log",
      "Admin",
    ]);
    expect(within(menu).getByRole("link", { name: "Reports" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Focus moves into the menu.
    expect(within(menu).getByRole("link", { name: "Requests" })).toHaveFocus();
  });

  test("Esc closes the menu and returns focus to the menu button", async () => {
    renderBar();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.keyboard("{Escape}");
    expect(document.getElementById("phone-menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  test("the menu closes once the new page is shown", async () => {
    const { rerender } = render(
      <TopBar items={adminItems} userName="Raju Bholani" userRole="Admin" />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.getElementById("phone-menu")).not.toBeNull();
    // Navigation finished: the URL is now /admin.
    pathname = "/admin";
    rerender(
      <TopBar items={adminItems} userName="Raju Bholani" userRole="Admin" />,
    );
    expect(document.getElementById("phone-menu")).toBeNull();
  });

  test("choosing the page you are on closes the menu", async () => {
    renderBar();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = document.getElementById("phone-menu")!;
    await user.click(within(menu).getByRole("link", { name: "Reports" }));
    expect(document.getElementById("phone-menu")).toBeNull();
  });

  test("signs out from the menu", async () => {
    renderBar();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = document.getElementById("phone-menu")!;
    await user.click(within(menu).getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in" });
  });

  test("approvers see how many requests wait — on the link and the menu button", () => {
    pathname = "/approvals";
    render(
      <TopBar
        items={[
          { href: "/approvals", label: "Approvals", badge: 2 },
          { href: "/records", label: "Records" },
        ]}
        userName="Moises Larez"
        userRole="Approver"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Approvals, 2 waiting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open menu, 2 waiting" }),
    ).toBeInTheDocument();
  });
});
