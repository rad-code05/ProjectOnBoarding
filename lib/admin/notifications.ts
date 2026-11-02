import "server-only";
import { senderAddress, sendMode } from "@/lib/notifications/policy";
import { formatDay, formatDayTime } from "@/lib/requests/format";
import { personName } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";
import {
  recentEmails,
  senderStatus,
  type EmailSwitches,
  type RecentEmail,
} from "./notifications-shared";

export type NotificationsView = {
  sender: string;
  status: ReturnType<typeof senderStatus>;
  switches: EmailSwitches;
  reminderAfterDays: number;
  slaWarnHours: number;
  lastChanged: string | null;
  recent: (RecentEmail & { when: string })[];
};

const DAYS = 30;

/**
 * Admin → Notifications (F23c): the settings row, this site's sender status
 * and the last 30 days of the outbox. Admin only (RLS on both tables).
 */
export async function loadNotifications(): Promise<NotificationsView> {
  const supabase = createServerSupabaseClient();
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const [settings, outbox, tz] = await Promise.all([
    supabase
      .from("notification_settings")
      .select(
        "waiting, reminder, returned, closed, sla_due, sla_missed, reminder_after_days, sla_warn_hours, updated_by, updated_at, editor:app_users!notification_settings_updated_by_fkey(first_name, last_name)",
      )
      .maybeSingle(),
    supabase
      .from("email_outbox")
      .select(
        "id, kind, request_id, status, attempts, last_error, created_at, sent_at, to_email, recipient:app_users!email_outbox_to_user_fkey(first_name, last_name), request:requests!email_outbox_request_id_fkey(first_name, last_name)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    displayTimezone(),
  ]);
  if (settings.error || !settings.data)
    throw new Error("Could not load the notification settings.");
  if (outbox.error) throw new Error("Could not load the recent emails.");

  const s = settings.data;
  const rows = (outbox.data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    requestId: r.request_id,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    to:
      personName(r.recipient?.first_name, r.recipient?.last_name) || r.to_email,
    person: r.request
      ? { firstName: r.request.first_name, lastName: r.request.last_name }
      : null,
  }));

  return {
    sender: senderAddress(process.env),
    status: senderStatus(sendMode(process.env)),
    switches: {
      waiting: s.waiting,
      reminder: s.reminder,
      returned: s.returned,
      closed: s.closed,
      sla_due: s.sla_due,
      sla_missed: s.sla_missed,
    },
    reminderAfterDays: s.reminder_after_days,
    slaWarnHours: s.sla_warn_hours,
    lastChanged: s.updated_by
      ? `${personName(s.editor?.first_name, s.editor?.last_name) || "An admin"} · ${formatDay(s.updated_at, tz)}`
      : null,
    recent: recentEmails(rows)
      .slice(0, 50)
      .map((line) => ({ ...line, when: formatDayTime(line.at, tz) })),
  };
}
