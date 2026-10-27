import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  ACCEPT_ALL_CONFIRM_OVER,
  SuggestedField,
  SuggestedItems,
  SuggestionsBanner,
} from "./Suggestions";

const banner = (total: number) => {
  const handlers = {
    onAcceptAll: vi.fn(),
    onRejectAll: vi.fn(),
    onNext: vi.fn(),
  };
  render(
    <SuggestionsBanner
      total={total}
      busy={false}
      message={null}
      {...handlers}
    />,
  );
  return handlers;
};

describe("SuggestionsBanner", () => {
  test("says how many wait and that nothing is saved yet", () => {
    banner(4);
    const region = screen.getByRole("region", {
      name: "Suggestions from the assistant",
    });
    expect(region).toHaveTextContent("4 suggestions from the assistant");
    expect(region).toHaveTextContent("Nothing is saved until you accept");
  });

  test("Accept all at once when few, Next and Reject all", async () => {
    const h = banner(4);
    await userEvent.click(screen.getByRole("button", { name: "Accept all 4" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Next suggestion" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Reject all" }));
    expect(h.onAcceptAll).toHaveBeenCalledTimes(1);
    expect(h.onNext).toHaveBeenCalledTimes(1);
    expect(h.onRejectAll).toHaveBeenCalledTimes(1);
  });

  test("more than 10: Accept all asks once more", async () => {
    const total = ACCEPT_ALL_CONFIRM_OVER + 2;
    const h = banner(total);
    await userEvent.click(
      screen.getByRole("button", { name: `Accept all ${total}` }),
    );
    expect(h.onAcceptAll).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      `That fills ${total} values`,
    );
    await userEvent.click(
      screen.getByRole("button", { name: `Yes, accept all ${total}` }),
    );
    expect(h.onAcceptAll).toHaveBeenCalledTimes(1);
  });
});

describe("SuggestedField and SuggestedItems", () => {
  test("a field: the value, why, and its own Accept / Reject", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <SuggestedField
        label="Manager"
        suggestion={{
          id: "s1",
          key: "manager_name",
          patch: { manager_name: "Omar Haddad" },
          shown: "Omar Haddad",
          reason: "you said so",
        }}
        busy={false}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );
    const group = screen.getByRole("group", { name: "Manager" });
    expect(group).toHaveTextContent("Omar Haddad");
    expect(group).toHaveTextContent("Suggested · you said so");
    await userEvent.click(
      screen.getByRole("button", { name: "Accept Manager: Omar Haddad" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reject Manager: Omar Haddad" }),
    );
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  test("items: one row each, decided by id; nothing when empty", async () => {
    const onAccept = vi.fn();
    const { container, rerender } = render(
      <SuggestedItems
        items={[
          {
            id: "a1",
            kind: "access",
            name: "GitHub",
            detail: "Grant · Member",
            reason: "usual for Engineering",
          },
        ]}
        busy={false}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Suggested by the assistant" }),
    ).toHaveTextContent("GitHubGrant · Member");
    await userEvent.click(
      screen.getByRole("button", { name: "Accept GitHub (Grant · Member)" }),
    );
    expect(onAccept).toHaveBeenCalledWith("a1");
    rerender(
      <SuggestedItems
        items={[]}
        busy={false}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("only the button pressed shows that it is saving (Raju, 2026-10-27)", () => {
  test("while another suggestion saves, the buttons keep their look and wait", async () => {
    const onAccept = vi.fn();
    render(
      <SuggestedField
        label="Manager"
        suggestion={{
          id: "s1",
          key: "manager_name",
          patch: { manager_name: "Omar Haddad" },
          shown: "Omar Haddad",
          reason: null,
        }}
        busy
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    );
    const accept = screen.getByRole("button", {
      name: "Accept Manager: Omar Haddad",
    });
    expect(accept).not.toBeDisabled();
    expect(accept).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(accept);
    expect(onAccept).not.toHaveBeenCalled();
  });

  test("the one being saved shows it — Accept or Reject, not both", () => {
    render(
      <SuggestedItems
        items={[
          {
            id: "a1",
            kind: "access",
            name: "GitHub",
            detail: "",
            reason: null,
          },
          { id: "a2", kind: "access", name: "Slack", detail: "", reason: null },
        ]}
        busy
        working={{ id: "a1", accept: true }}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Accept GitHub" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "Reject GitHub" }),
    ).not.toHaveAttribute("aria-busy");
    expect(
      screen.getByRole("button", { name: "Accept Slack" }),
    ).not.toHaveAttribute("aria-busy");
  });
});
