import type { RecordInput } from "./record";

/** A realistic closed onboarding (fake person) for tests and previews. */
export function sampleRecord(patch: Partial<RecordInput> = {}): RecordInput {
  return {
    snapshot: {
      request: {
        ticket_id: "UAM-2026-000124",
        type: "onboarding",
        form_version: "4.1",
        first_name: "José",
        last_name: "Müller",
        work_email: "jose.muller@laine.ai",
        job_title: "Product Designer",
        department: "Engineering",
        country: "AE",
        manager_name: "Mara Manager",
        requestor_name: "Rita Requestor",
        effective_date: "2026-10-14",
        execution_started_at: "2026-10-09T07:12:00.000000Z",
      },
      access: [
        { app: "Google Workspace", action: "Grant", permission: "User" },
        { app: "Slack", action: "Grant", permission: "Member" },
        { app: "Figma", action: "Grant", permission: "Viewer" },
        { app: "Zoom", action: "Grant", permission: "Licensed" },
      ],
      equipment: [
        {
          type: "Laptop · macOS",
          action: "Issue",
          description: null,
          asset_tag: "LN-0042",
        },
      ],
      physical_access: [
        { type: "Office access", action: "Grant", scope: "Badge" },
      ],
      execution: {
        checks: {
          access_provisioned: true,
          devices_enrolled: true,
          security_controls: true,
        },
        notes: "Laptop shipped with MDM profile.",
        executed_by_name: "Raju Bholani",
      },
    },
    fingerprint:
      "43779ef2a1c0b5d4e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d",
    fileName: "jose.muller-onboarding.pdf",
    timezone: "Asia/Dubai",
    generatedAt: "2026-10-09T12:05:10.000Z",
    request: {
      priority: "medium",
      assigneeName: "Raju Bholani",
      openedAt: "2026-10-08T10:12:00.000Z",
      closedAt: "2026-10-09T12:05:00.000Z",
    },
    checklist: [
      {
        key: "access_provisioned",
        label: "All authorised access provisioned or modified",
      },
      { key: "devices_enrolled", label: "Devices issued and enrolled (MDM)" },
      {
        key: "security_controls",
        label: "Security controls applied (MFA, MDM, EDR)",
      },
    ],
    signatures: [
      {
        section: "it_execution",
        signerName: "Raju Bholani",
        signedAt: "2026-10-09T10:12:00.000Z",
        typedText: "RB",
        image: null,
        note: "Figma is Viewer now",
      },
      {
        section: "final_confirmation",
        signerName: "Moises Larez",
        signedAt: "2026-10-09T12:05:00.000Z",
        typedText: "ML",
        image: null,
        note: null,
      },
    ],
    ...patch,
  };
}
