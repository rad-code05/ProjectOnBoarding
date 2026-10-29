// @vitest-environment node
import type { UIMessage } from "ai";
import { describe, expect, test } from "vitest";
import {
  REFUSED_ANSWER,
  answeredOnServer,
  chatGroups,
  chatProblem,
  greeting,
  lastIsQuestion,
  lastQuestion,
  starterQuestions,
  stepDownloads,
  stepLink,
  stepLinkLabel,
  stepPdfLink,
  toolStep,
  withRefusedText,
  answeredApproval,
  attachedList,
  attachedListText,
  confirmCard,
} from "./chat-ui";

describe("greeting", () => {
  test("morning, afternoon, evening by the hour", () => {
    expect(greeting("Raju", 8)).toBe("Good morning, Raju.");
    expect(greeting("Raju", 14)).toBe("Good afternoon, Raju.");
    expect(greeting("Moises", 19)).toBe("Good evening, Moises.");
  });
});

describe("starterQuestions", () => {
  test("approvers get questions about approving; IT about requests", () => {
    expect(starterQuestions(["approver"])).toContain(
      "How long did approvals take this month?",
    );
    expect(starterQuestions(["admin", "requester"])).toContain(
      "Who has Admin rights in any application?",
    );
  });
});

describe("chatProblem (board: App help, off-topic, limits)", () => {
  const tz = "Asia/Dubai";
  test("limits and settings in plain words", () => {
    expect(chatProblem('{"error":"not_configured"}', tz)).toMatchObject({
      title: "The assistant isn't set up yet",
      retry: false,
    });
    expect(chatProblem('{"error":"off","resetsAt":null}', tz).title).toBe(
      "The assistant is switched off",
    );
    expect(
      chatProblem('{"error":"budget","resetsAt":"2026-10-31T20:00:00Z"}', tz),
    ).toMatchObject({
      title: "The assistant is paused for this month",
      text: expect.stringContaining("It starts again on 1 Nov"),
    });
    expect(
      chatProblem('{"error":"rate","resetsAt":"2026-10-23T08:12:00Z"}', tz)
        .text,
    ).toContain("Try again at 12:12");
  });

  test("anything else: something went wrong, try again", () => {
    expect(chatProblem("Failed to fetch", tz)).toMatchObject({
      kind: "error",
      retry: true,
    });
    expect(chatProblem(undefined).kind).toBe("error");
  });
});

describe("toolStep", () => {
  test("help steps in plain words", () => {
    expect(toolStep("getAppHelp", false, null)).toBe("Reading the help…");
    expect(toolStep("getAppHelp", true, { title: "Statuses & who acts" })).toBe(
      "Read the help page Statuses & who acts",
    );
    expect(toolStep("someTool", true, null)).toBe("Looked it up");
    expect(toolStep("runReport", true, { report: "Onboarded by office" })).toBe(
      "Ran the report Onboarded by office",
    );
    expect(toolStep("runReport", true, { error: "x" })).toBe(
      "Couldn't run the report",
    );
  });

  test("the report link: only our own report pages", () => {
    expect(stepLink({ link: "/reports/onboarded-by-office?office=1" })).toBe(
      "/reports/onboarded-by-office?office=1",
    );
    const id = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
    expect(stepLink({ link: `/requests/${id}` })).toBe(`/requests/${id}`);
    expect(stepLink({ link: `/records/${id}` })).toBe(`/records/${id}`);
    expect(stepLink({ link: "/requests/new?x=1" })).toBeNull();
    expect(stepLink({ link: "/admin/settings" })).toBeNull();
    expect(stepLinkLabel(`/records/${id}`)).toBe("Open the request");
    expect(stepLinkLabel("/reports/open-requests")).toBe("Open the report");
    // The record PDF: only "/records/<id>/pdf".
    expect(stepPdfLink({ pdfLink: `/records/${id}/pdf` })).toBe(
      `/records/${id}/pdf`,
    );
    expect(stepPdfLink({ pdfLink: `/records/${id}/pdf?x=1` })).toBeNull();
    expect(stepPdfLink({ pdfLink: "https://evil.example/x.pdf" })).toBeNull();
    expect(stepPdfLink({ link: `/records/${id}` })).toBeNull();
    expect(stepLink({ link: "https://evil.example" })).toBeNull();
    expect(stepLink({ link: "javascript:alert(1)" })).toBeNull();
    expect(stepLink(null)).toBeNull();
  });
});

describe("after a lost connection", () => {
  const q = (text: string) =>
    ({ id: text, role: "user", parts: [{ type: "text", text }] }) as UIMessage;
  const a = (text: string) =>
    ({
      id: text,
      role: "assistant",
      parts: [{ type: "text", text }],
    }) as UIMessage;

  test("a chat ending with a question is still waiting for its answer", () => {
    expect(lastIsQuestion([q("Hi"), a("Hello.")])).toBe(false);
    expect(lastIsQuestion([q("Hi"), a("Hello."), q("Slack?")])).toBe(true);
    expect(lastIsQuestion([])).toBe(false);
  });

  test("the server answered this very question meanwhile", () => {
    const saved = [q("Hi"), a("Hello."), q("Slack?"), a("Two people.")];
    expect(answeredOnServer(saved, "Slack?")).toBe(true);
    expect(answeredOnServer(saved.slice(0, 3), "Slack?")).toBe(false);
    // The question never reached the server: ask again.
    expect(answeredOnServer(saved.slice(0, 2), "Slack?")).toBe(false);
    expect(lastQuestion(saved)).toBe("Slack?");
  });
});

describe("withRefusedText (the safety filter stopped the answer)", () => {
  test("an empty answer gets the fixed refusal; a real answer is left alone", () => {
    const empty = {
      id: "r",
      role: "assistant",
      parts: [{ type: "step-start" }],
    } as UIMessage;
    expect(withRefusedText(empty).parts).toEqual([
      { type: "step-start" },
      { type: "text", text: REFUSED_ANSWER },
    ]);
    const real = {
      id: "s",
      role: "assistant",
      parts: [{ type: "text", text: "Two people." }],
    } as UIMessage;
    expect(withRefusedText(real)).toBe(real);
    const user = { id: "u", role: "user", parts: [] } as unknown as UIMessage;
    expect(withRefusedText(user)).toBe(user);
  });
});

describe("chatGroups (board: Previous chats)", () => {
  const chat = (id: string, updatedAt: string) => ({
    id,
    title: id,
    updatedAt,
    messages: 2,
  });
  // Saturday 24 Oct 2026, 15:00 in Dubai.
  const now = new Date("2026-10-24T11:00:00Z");

  test("Today, This week (from Monday), Older — on the person's clock", () => {
    const groups = chatGroups(
      [
        chat("today", "2026-10-24T10:42:00Z"),
        chat("tuesday", "2026-10-20T08:00:00Z"),
        // Sunday 18 Oct: the week before.
        chat("old", "2026-10-18T08:00:00Z"),
      ],
      "Asia/Dubai",
      now,
    );
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.when)])).toEqual([
      ["Today", ["14:42"]],
      ["This week", ["Tue 20 Oct"]],
      ["Older", ["18 Oct 2026"]],
    ]);
  });

  test("late evening UTC is already tomorrow in Dubai", () => {
    const groups = chatGroups(
      [chat("x", "2026-10-23T21:30:00Z")],
      "Asia/Dubai",
      now,
    );
    expect(groups[0].label).toBe("Today");
  });
});

describe("a custom report in the step line (F17a)", () => {
  const id = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
  const built = {
    link: `/reports/custom/${id}`,
    changed: false,
    parts: [{}, {}],
  };

  test("built or changed, with Open the report and CSV · PDF · Excel", () => {
    expect(toolStep("saveCustomReport", false, null)).toBe(
      "Building the custom report…",
    );
    expect(toolStep("saveCustomReport", true, built)).toBe(
      "Built a custom report · 2 parts",
    );
    expect(
      toolStep("saveCustomReport", true, { ...built, changed: true }),
    ).toBe("Changed the custom report");
    expect(toolStep("saveCustomReport", true, { error: "Fix it." })).toBe(
      "Couldn't build the custom report",
    );
    expect(stepLink(built)).toBe(`/reports/custom/${id}`);
    expect(stepLinkLabel(`/reports/custom/${id}`)).toBe("Open the report");
    expect(stepDownloads(built)).toEqual([
      { label: "CSV", href: `/reports/custom/${id}/export` },
      { label: "PDF", href: `/reports/custom/${id}/export?format=pdf` },
      { label: "Excel", href: `/reports/custom/${id}/export?format=xlsx` },
    ]);
  });
});

describe("stepDownloads (the report's own CSV / PDF export)", () => {
  test("same filters, the export route next to the report", () => {
    expect(
      stepDownloads({
        link: "/reports/onboarded-by-office?period=12m&office=1",
      }),
    ).toEqual([
      {
        label: "Download CSV",
        href: "/reports/onboarded-by-office/export?period=12m&office=1",
      },
      {
        label: "PDF",
        href: "/reports/onboarded-by-office/export?period=12m&office=1&format=pdf",
      },
    ]);
  });

  test("one application's holders export through Access by application", () => {
    expect(
      stepDownloads({
        link: "/reports/access-by-application/holders?kind=app&item=app%3A3",
      })[0].href,
    ).toBe("/reports/access-by-application/export?kind=app&item=app%3A3");
  });

  test("no filters; and nothing for requests or other pages", () => {
    expect(stepDownloads({ link: "/reports/open-requests" })[1].href).toBe(
      "/reports/open-requests/export?format=pdf",
    );
    expect(
      stepDownloads({ link: "/records/6f9619ff-8b86-4011-b42d-00c04fc964ff" }),
    ).toEqual([]);
    expect(stepDownloads({ link: "/reports/x/y/z" })).toEqual([]);
    expect(stepDownloads(null)).toEqual([]);
  });
});

describe("filling by chat (F16c)", () => {
  test("the Confirm card lists every value in words", () => {
    const card = confirmCard("createOnboardingDraft", {
      firstName: "Meera",
      lastName: "Nair",
      workEmail: "meera.nair@laine.ai",
      jobTitle: "Backend developer",
      department: "Engineering",
      manager: "Omar Haddad",
      office: "Dubai",
      startDate: "2026-10-26",
      nationalities: ["India"],
      applications: [
        { name: "Slack", permission: "Regular Member" },
        { name: "GitHub", permission: "Member" },
      ],
      equipment: [{ type: "Laptop · macOS" }],
      access: [{ type: "Office access", scope: "Badge" }],
    });
    expect(card?.title).toBe("Create a draft onboarding for Meera Nair?");
    expect(card?.yes).toBe("Confirm — create the draft");
    expect(card?.rows).toEqual([
      { label: "Employee", value: "Meera Nair · meera.nair@laine.ai" },
      { label: "Job", value: "Backend developer · Engineering" },
      { label: "Manager", value: "Omar Haddad" },
      { label: "Office", value: "Dubai" },
      { label: "Start date", value: "26 Oct 2026" },
      { label: "Nationality", value: "India" },
      {
        label: "Applications",
        value: "Slack · Regular Member, GitHub · Member",
      },
      { label: "Equipment", value: "Laptop · macOS" },
      { label: "Access", value: "Office access · Badge" },
    ]);
    expect(confirmCard("deleteEverything", {})).toBeNull();
    expect(
      confirmCard("createOnboardingDraft", {
        firstName: "Meera",
        lastName: "Nair",
        notNeeded: ["equipment", "nationalities"],
      })?.rows.at(-1),
    ).toEqual({ label: "Not needed", value: "equipment, nationality" });
    const leaving = confirmCard("createOffboardingDraft", {
      person: "Arjun Mehta",
      lastWorkingDay: "2026-10-30",
      slaTimeline: "same_day",
      cutoffDate: "2026-10-30",
      cutoffTime: "18:00",
      handoverTo: "Rafiq Ahmed",
      removalMethod: "Suspend",
      mailbox: "converted_shared",
    });
    expect(leaving?.title).toBe("Start an offboarding for Arjun Mehta?");
    expect(leaving?.yes).toBe("Confirm — start the offboarding");
    expect(leaving?.rows).toEqual([
      { label: "Leaving", value: "Arjun Mehta" },
      { label: "Last working day", value: "30 Oct 2026" },
      { label: "SLA", value: "Same day" },
      { label: "Access cut-off", value: "30 Oct 2026, 18:00" },
      { label: "Handover", value: "Rafiq Ahmed" },
      {
        label: "Removals",
        value: "Pre-filled from everything they hold today",
      },
      { label: "Removal method", value: "Suspend (all applications)" },
      { label: "Mailbox", value: "Convert to a shared mailbox" },
      { label: "Effective date", value: "30 Oct 2026" },
    ]);
    expect(
      toolStep("createOffboardingDraft", true, {
        created: true,
        ticket: "UAM-2026-000410",
        suggestions: 4,
      }),
    ).toBe("Started the offboarding UAM-2026-000410 · 4 suggestions waiting");
    const changing = confirmCard("createAccessChangeDraft", {
      person: "Omar Haddad",
      effectiveDate: "2026-11-01",
      changes: [
        { item: "Slack", action: "change", to: "Workspace Owner" },
        { item: "Figma", action: "remove" },
      ],
      add: { applications: [{ name: "HubSpot", permission: "Admin" }] },
    });
    expect(changing?.title).toBe("Start an access change for Omar Haddad?");
    expect(changing?.rows).toEqual([
      { label: "Person", value: "Omar Haddad" },
      { label: "Effective date", value: "1 Nov 2026" },
      { label: "Change", value: "Slack to Workspace Owner" },
      { label: "Remove / return", value: "Figma" },
      { label: "Add", value: "HubSpot · Admin" },
      { label: "Everything else", value: "Kept as they hold it today" },
    ]);
    expect(
      toolStep("createAccessChangeDraft", true, {
        created: true,
        ticket: "UAM-2026-000420",
        suggestions: 4,
      }),
    ).toBe("Started the access change UAM-2026-000420 · 4 suggestions waiting");
  });

  test("the step line says what happened", () => {
    expect(toolStep("createOnboardingDraft", false, null)).toBe(
      "Creating the draft…",
    );
    expect(
      toolStep("createOnboardingDraft", true, {
        created: true,
        ticket: "UAM-2026-000027",
        suggestions: 11,
      }),
    ).toBe("Created the draft UAM-2026-000027 · 11 suggestions waiting");
    expect(
      toolStep("createOnboardingDraft", true, { created: false, problems: [] }),
    ).toBe("Didn't create the draft — a few things to check");
    expect(
      toolStep("suggestValues", true, { added: 2, ticket: "UAM-2026-000404" }),
    ).toBe("Added 2 suggestions to UAM-2026-000404");
    expect(toolStep("suggestValues", true, { added: 0 })).toBe(
      "Didn't add anything — a few things to check",
    );
  });

  test("answeredApproval: what a Confirm / Not now sends", () => {
    const message = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-createOnboardingDraft",
          toolCallId: "c1",
          state: "approval-responded",
          input: {},
          approval: { id: "ap1", approved: true },
        },
      ],
    } as unknown as UIMessage;
    expect(answeredApproval(message)).toEqual({ id: "ap1", approved: true });
    expect(
      answeredApproval({ id: "u", role: "user", parts: [] } as UIMessage),
    ).toBeNull();
  });
});

describe("batches by chat (F17b-4)", () => {
  const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
  const read = {
    link: `/requests/batch/${ID}`,
    people: 4,
    ready: 2,
    needAttention: 1,
    leftOut: 1,
  };

  test("the step line counts the rows and links to the batch", () => {
    expect(toolStep("proposeBatch", true, read)).toBe(
      "Read 4 people · 2 ready · 1 needs attention · 1 left out",
    );
    expect(toolStep("fixBatchRow", true, { ...read, changedRow: 2 })).toBe(
      "Fixed row 2 · 2 ready · 1 needs attention · 1 left out",
    );
    expect(toolStep("getBatch", true, { error: "No such batch" })).toBe(
      "Couldn't read the batch",
    );
    expect(stepLink(read)).toBe(`/requests/batch/${ID}`);
    expect(stepLinkLabel(`/requests/batch/${ID}`)).toBe("Open the batch");
    expect(stepLink({ link: "/requests/batch/new" })).toBeNull();
    expect(
      toolStep("createBatchDrafts", true, { created: true, drafts: 3 }),
    ).toBe("Created 3 drafts");
  });

  test("the Confirm card names who gets a draft and who doesn't", () => {
    const card = confirmCard("createBatchDrafts", {
      batchId: ID,
      create: ["Meera Nair", "Tom Becker"],
      notCreated: ["Sara Lopez"],
    });
    expect(card?.title).toBe("Create 2 draft onboardings?");
    expect(card?.rows).toEqual([
      { label: "Drafts for", value: "Meera Nair, Tom Becker" },
      { label: "Not created", value: "Sara Lopez" },
    ]);
    expect(card?.yes).toBe("Confirm — create 2 drafts");
    expect(card?.note).toMatch(/signed one by one/);
  });

  test("a paperclip message carries the file name and the batch id only", () => {
    const text = attachedListText(
      "joiners “Nov”.xlsx",
      ID,
      " these start Monday ",
    );
    expect(text).toBe(
      `Attached list “joiners Nov.xlsx” (batch ${ID}).\nthese start Monday`,
    );
    expect(attachedList(text)).toEqual({
      fileName: "joiners Nov.xlsx",
      batchId: ID,
      note: "these start Monday",
    });
    expect(attachedList(attachedListText("a.csv", ID))).toEqual({
      fileName: "a.csv",
      batchId: ID,
      note: "",
    });
    expect(attachedList("Attached list “a.csv” (batch nope).")).toBeNull();
  });
});
