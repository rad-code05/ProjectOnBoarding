import { render, screen } from "@testing-library/react";
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
