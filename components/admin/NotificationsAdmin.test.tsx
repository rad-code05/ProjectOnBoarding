import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NotificationsView } from "@/lib/admin/notifications";
import { NotificationsAdmin } from "./NotificationsAdmin";

const saveNotificationSettings = vi.fn();
const sendTestEmail = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/admin/actions", () => ({
  saveNotificationSettings: (input: unknown) => saveNotificationSettings(input),
  sendTestEmail: () => sendTestEmail(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const view: NotificationsView = {
  sender: "Laine onboarding rights <no-reply@access-notify.laine.ai>",
  status: {
    headline: "Not connected yet",
    line: "Emails wait in the outbox",
    connected: false,
  },
  switches: {
    waiting: true,
    reminder: true,
    returned: true,
    closed: true,
    sla_due: true,
    sla_missed: true,
  },
  reminderAfterDays: 2,
  slaWarnHours: 6,
  lastChanged: null,
  recent: [
    {
      key: "1",
      subject: "Returned: Lina Haddad",
      to: "Raju Bholani",
      at: "2026-10-29T12:40:00Z",
      when: "29 Oct 2026, 16:40",
      status: "Failed",
      note: "Resend 422 validation_error: bad address",
    },
  ],
};

describe("NotificationsAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  test("shows the sender status, six switches and the recent emails", () => {
    render(<NotificationsAdmin view={view} />);
    expect(
      screen.getByRole("group", { name: "Sender status" }),
    ).toHaveTextContent("Not connected yetEmails wait in the outbox");
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    expect(
      screen.getByRole("switch", { name: /Reminder to approvers/ }),
    ).toBeChecked();
    expect(screen.getByText("Daily after 2 days of waiting.")).toBeVisible();
    const recent = screen.getByRole("region", { name: "Recent emails" });
    expect(within(recent).getByText("Returned: Lina Haddad")).toBeVisible();
    expect(within(recent).getByText("Failed")).toBeVisible();
    expect(
      within(recent).getByText("Resend 422 validation_error: bad address"),
    ).toBeVisible();
  });

  test("Save sends every switch, the changed one off", async () => {
    saveNotificationSettings.mockResolvedValue({ ok: true });
    render(<NotificationsAdmin view={view} />);
    await userEvent.click(screen.getByRole("switch", { name: /^SLA missed/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveNotificationSettings).toHaveBeenCalledWith({
        ...view.switches,
        sla_missed: false,
      }),
    );
    expect(await screen.findByText("Notifications saved.")).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  test("a refused save shows the reason", async () => {
    saveNotificationSettings.mockResolvedValue({
      ok: false,
      message: "Only an admin changes the notifications.",
    });
    render(<NotificationsAdmin view={view} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Only an admin changes the notifications."),
    ).toBeVisible();
  });

  test("Send a test email to me queues one", async () => {
    sendTestEmail.mockResolvedValue({ ok: true });
    render(<NotificationsAdmin view={view} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Send a test email to me" }),
    );
    expect(
      await screen.findByText(
        "Test email queued — it shows under Recent emails.",
      ),
    ).toBeVisible();
    expect(sendTestEmail).toHaveBeenCalledTimes(1);
  });

  test("shows the newest 10 emails, Show more for the rest", async () => {
    const recent = Array.from({ length: 12 }, (_, i) => ({
      ...view.recent[0]!,
      key: String(i),
      subject: `Closed — PDF ready: Person ${i}`,
    }));
    render(<NotificationsAdmin view={{ ...view, recent }} />);
    const list = screen.getByRole("region", { name: "Recent emails" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    await userEvent.click(
      screen.getByRole("button", { name: "Show more (2)" }),
    );
    expect(within(list).getAllByRole("listitem")).toHaveLength(12);
  });
});
