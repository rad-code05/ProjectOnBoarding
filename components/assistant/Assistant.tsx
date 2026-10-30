"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { readBatchUpload } from "@/app/(app)/requests/batch/actions";
import { CheckIcon, CloseIcon, HistoryIcon, IconButton } from "@/components/ui";
import type { Role } from "@/lib/auth";
import {
  MAX_QUESTION_LENGTH,
  answeredApproval,
  answeredOnServer,
  attachedList,
  attachedListText,
  chatProblem,
  confirmCard,
  greeting,
  lastIsQuestion,
  lastQuestion,
  starterQuestions,
  stepLink,
  stepLinkLabel,
  stepPdfLink,
  stepDownloads,
  toolStep,
  withRefusedText,
} from "@/lib/ai/chat-ui";
import {
  readWaitingSuggestions,
  subscribeWaitingSuggestions,
} from "@/lib/ai/suggestion-badge";
import { cn } from "@/lib/cn";
import { loadAssistantChat } from "./actions";
import { AnswerText } from "./AnswerText";
import { PreviousChats } from "./PreviousChats";
import { RobotAvatar } from "./RobotAvatar";

const OPEN_KEY = "laine.assistant.open";
const OPEN_EVENT = "laine-assistant-open";
/** When the browser won't store anything (private window): this page only. */
let openInMemory = false;

const readOpen = () => {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return openInMemory;
  }
};
const writeOpen = (open: boolean) => {
  openInMemory = open;
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // private window: remembered for this page only
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
};
const subscribeOpen = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(OPEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(OPEN_EVENT, onChange);
  };
};

const GREETED_KEY = "laine.assistant.greeted";
/** Today on this device's clock: "2026-10-23". */
const today = () => new Date().toLocaleDateString("en-CA");
/** When the browser won't store anything (private window): this page only. */
let greetedInMemory = "";
/** The day the greeting bubble was last answered here ("" = never). */
const readGreeted = () => {
  try {
    return window.localStorage.getItem(GREETED_KEY) ?? "";
  } catch {
    return greetedInMemory;
  }
};
const writeGreeted = () => {
  greetedInMemory = today();
  try {
    window.localStorage.setItem(GREETED_KEY, greetedInMemory);
  } catch {
    // private window: this page only
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
};

const CHAT_KEY = "laine.assistant.chat";
/** After a reload mid-answer: look for the saved answer every 3 s, 90 s long. */
const POLL_MS = 3_000;
const POLL_TRIES = 30;
/** The chat shown on this device, kept across reloads and pages. */
const readChatId = (): string | null => {
  try {
    return window.localStorage.getItem(CHAT_KEY);
  } catch {
    return null;
  }
};
const writeChatId = (id: string) => {
  try {
    window.localStorage.setItem(CHAT_KEY, id);
  } catch {
    // private window: a reload starts a new chat
  }
};

/**
 * The Laine assistant (F15c; boards: Robot closed, Assistant chat, App help
 * & limits): the robot floats bottom-right on every page; it opens a chat —
 * full screen on a phone, a side panel on desktop. Open / closed is
 * remembered on this device.
 */
export function Assistant({
  name,
  roles,
  favourite = null,
}: {
  name: string;
  roles: Role[];
  /** Their latest report (memory) — the closed robot offers to open it. */
  favourite?: { name: string; href: string } | null;
}) {
  // Open / closed from this device's storage; closed on the server.
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => false);
  const launcher = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  // Above the request form's sticky Save / Review & sign bar.
  const lifted = /^\/requests\/[^/]+$/.test(pathname);

  // The greeting bubble (board: Robot closed): once a day on this device,
  // never on that report itself; hidden while the server draws the page.
  const greeted = useSyncExternalStore(subscribeOpen, readGreeted, () => null);
  const waiting = useSyncExternalStore(
    subscribeWaitingSuggestions,
    readWaitingSuggestions,
    () => 0,
  );
  const greet =
    favourite !== null &&
    !open &&
    greeted !== null &&
    greeted !== today() &&
    !pathname.startsWith(favourite.href);

  const show = (next: boolean) => {
    writeOpen(next);
    if (!next) requestAnimationFrame(() => launcher.current?.focus());
  };

  return (
    <>
      {/* Room at the end of the page, so the robot never covers its last
          buttons (Show more, Save …) once scrolled to the bottom. */}
      <div aria-hidden="true" className="h-18" />
      {greet && (
        <div
          role="status"
          className={cn(
            "fixed right-4 z-30 flex max-w-62.5 flex-col gap-2 rounded-[14px_14px_4px_14px] border border-line bg-paper px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] md:right-7",
            lifted ? "bottom-[174px]" : "bottom-[98px]",
          )}
        >
          <span className="text-sm leading-snug">
            {greeting(name, new Date().getHours())} Shall I open the{" "}
            <strong>{favourite.name}</strong> again?
          </span>
          <span className="flex gap-2">
            <Link
              href={favourite.href}
              onClick={writeGreeted}
              className="inline-flex h-9 items-center rounded-pill bg-ink px-3.5 text-[13px] font-semibold text-paper"
            >
              Yes, open it
            </Link>
            <button
              type="button"
              onClick={writeGreeted}
              className="h-9 cursor-pointer rounded-pill border border-field-border px-3 text-[13px] font-semibold"
            >
              Not now
            </button>
          </span>
        </div>
      )}
      {!open && (
        <button
          ref={launcher}
          type="button"
          aria-label={
            waiting
              ? `Open the Laine assistant — ${waiting} suggestion${waiting === 1 ? "" : "s"} waiting`
              : "Open the Laine assistant"
          }
          aria-haspopup="dialog"
          onClick={() => show(true)}
          className={cn(
            "group fixed right-4 z-30 flex size-17 cursor-pointer items-center justify-center rounded-pill border border-line bg-paper shadow-[0_8px_24px_rgba(0,0,0,0.14)] focus-visible:border-2 focus-visible:border-ink focus-visible:outline-none md:right-7",
            lifted ? "bottom-24" : "bottom-5",
          )}
        >
          <span className="group-hover:hidden group-focus-visible:hidden">
            <RobotAvatar />
          </span>
          <span className="hidden group-hover:block group-focus-visible:block">
            <RobotAvatar expression="happy" />
          </span>
          {waiting > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-pill border-2 border-sand bg-ink px-1.5 text-xs font-bold text-paper"
            >
              {waiting}
            </span>
          )}
        </button>
      )}
      {open && (
        <ChatPanel name={name} roles={roles} onClose={() => show(false)} />
      )}
    </>
  );
}

function ChatPanel({
  name,
  roles,
  onClose,
}: {
  name: string;
  roles: Role[];
  onClose: () => void;
}) {
  const titleId = useId();
  const inputId = useId();
  // The chat from last time on this device (its messages load below), or a
  // new one. The panel only renders in the browser, so storage is there.
  // The chat to load from the server: last time's, or one picked in
  // Previous chats (F15d-2e).
  const [restored, setRestored] = useState(readChatId);
  const [view, setView] = useState<"chat" | "chats">("chat");
  const [chatId, setChatId] = useState(() => {
    const id = restored ?? crypto.randomUUID();
    writeChatId(id);
    return id;
  });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const hello = useMemo(() => greeting(name, new Date().getHours()), [name]);
  const approverOnly = !roles.some(
    (r) => r === "admin" || r === "requester" || r === "it_operator",
  );
  // The paperclip (F17b-4): a list of joiners, leavers or role changes
  // becomes a batch (its kind follows the column titles, F17b-5d).
  const canBatch = roles.some((r) => r === "admin" || r === "requester");
  const fileRef = useRef<HTMLInputElement>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Only the new question — or a Confirm / Not now — travels; the
        // server loads the history.
        prepareSendMessagesRequest: ({ id, messages }) => {
          const last = messages[messages.length - 1];
          const approval = answeredApproval(last);
          return {
            body: approval
              ? { id, approval, messageId: last.id }
              : { id, message: last },
          };
        },
      }),
    [],
  );
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    regenerate,
    stop,
    clearError,
    addToolApprovalResponse,
  } = useChat({
    id: chatId,
    transport,
    // A Confirm / Not now goes to the server at once (F16c).
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    // The safety filter stopped the answer before a word: say so instead
    // of showing nothing (the server saves the same words).
    onFinish: ({ message, finishReason }) => {
      if (finishReason !== "content-filter") return;
      setMessages((now) =>
        now.map((m) => (m.id === message.id ? withRefusedText(m) : m)),
      );
    },
  });
  // A reload while the answer was still being written: "waiting" until the
  // server has saved it, "lost" if it never comes.
  const [pending, setPending] = useState<"waiting" | "lost" | null>(null);
  const busy =
    status === "submitted" || status === "streaming" || pending === "waiting";
  const problem = error ? chatProblem(error.message, timeZone) : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, [chatId]);
  useEffect(() => {
    // Only the chat from last time; New chat (or leaving) drops a late answer.
    if (!restored || chatId !== restored) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (tries: number) => {
      const saved = await loadAssistantChat(restored);
      if (!current) return;
      // Unless a question was already asked meanwhile.
      if (saved.length)
        setMessages((now) => (now.length > saved.length ? now : saved));
      if (!lastIsQuestion(saved)) return setPending(null);
      if (tries === 0) return setPending("lost");
      setPending("waiting");
      timer = setTimeout(() => void load(tries - 1), POLL_MS);
    };
    void load(POLL_TRIES);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [restored, chatId, setMessages]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, status]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    clearError();
    void sendMessage({ text: question.slice(0, MAX_QUESTION_LENGTH) });
    setInput("");
  };
  // The file is read into a batch on the server (the same reader as the
  // batch page); the chat only carries its name and the batch's id.
  const attach = async (file: File | undefined) => {
    if (!file || busy || attaching) return;
    setAttachError(null);
    setAttaching(true);
    const form = new FormData();
    form.set("type", "auto");
    form.set("file", file);
    const result = await readBatchUpload(form).catch(() => null);
    setAttaching(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!result?.ok) {
      setAttachError(result?.message ?? "Could not read the file. Try again.");
      return;
    }
    ask(attachedListText(file.name, result.id, input));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(input);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input);
    }
  };
  // The server may have finished the answer after the connection dropped:
  // show it rather than asking again (and paying twice).
  const tryAgain = async () => {
    clearError();
    setPending(null);
    const saved = await loadAssistantChat(chatId);
    if (answeredOnServer(saved, lastQuestion(messages))) setMessages(saved);
    else void regenerate();
  };
  const freshChat = () => {
    stop();
    setPending(null);
    const id = crypto.randomUUID();
    writeChatId(id);
    setChatId(id);
    setInput("");
  };
  const newChat = () => {
    freshChat();
    setView("chat");
  };
  // Previous chats → continue one: its messages load like after a reload.
  const openChat = (id: string) => {
    if (id !== chatId) {
      stop();
      setPending(null);
      writeChatId(id);
      setRestored(id);
      setChatId(id);
      setInput("");
    }
    setView("chat");
  };

  return (
    <section
      role="dialog"
      // The heading isn't there while Previous chats shows: same name.
      aria-labelledby={view === "chat" ? titleId : undefined}
      aria-label={view === "chats" ? "Laine assistant" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-60 flex flex-col bg-sand md:inset-y-0 md:right-0 md:left-auto md:w-95 md:border-l md:border-line md:shadow-[-8px_0_24px_rgba(0,0,0,0.08)]"
    >
      {view === "chats" ? (
        <PreviousChats
          currentId={chatId}
          timeZone={timeZone}
          onOpen={openChat}
          onNewChat={newChat}
          onBack={() => setView("chat")}
          onDeleted={(id) => {
            // The chat on screen is gone: start a fresh one.
            if (id === "all" || id === chatId) freshChat();
          }}
        />
      ) : (
        <>
          <header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-paper py-3 pr-2 pl-4">
            <RobotAvatar size={36} expression={busy ? "thinking" : "idle"} />
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 id={titleId} className="font-serif text-xl leading-tight">
                Laine assistant
              </h2>
              <span className="text-xs text-graphite">
                {approverOnly
                  ? "Report and app questions"
                  : "Answers from Laine's data only"}
              </span>
            </div>
            <IconButton
              label="Previous chats"
              icon={<HistoryIcon size={20} />}
              variant="ghost"
              onClick={() => setView("chats")}
            />
            <button
              type="button"
              onClick={newChat}
              className="h-10 cursor-pointer rounded-pill border border-field-border px-3 text-[13px] font-semibold"
            >
              New chat
            </button>
            <IconButton
              label="Close the assistant"
              icon={<CloseIcon />}
              variant="ghost"
              onClick={onClose}
            />
          </header>

          <div
            ref={logRef}
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            className="flex flex-1 flex-col gap-3.5 overflow-x-hidden overflow-y-auto p-4"
          >
            <Bubble from="assistant">
              {hello} What would you like to know today?
            </Bubble>
            {messages.length === 0 && (
              <ul aria-label="Suggestions" className="flex flex-wrap gap-2">
                {starterQuestions(roles).map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => ask(q)}
                      className="min-h-10 cursor-pointer rounded-pill border border-ink px-3.5 py-2 text-left text-[13px] font-semibold"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {messages.map((m) => (
              <Message
                key={m.id}
                message={m}
                busy={busy}
                onDecide={(id, approved) =>
                  void addToolApprovalResponse({ id, approved })
                }
              />
            ))}

            {(status === "submitted" || pending === "waiting") && (
              <div
                aria-label="The assistant is writing"
                className="flex gap-1.5 self-start rounded-[4px_14px_14px_14px] border border-line bg-paper px-4 py-3"
              >
                <span className="size-2 rounded-pill bg-ink motion-safe:animate-pulse" />
                <span className="size-2 rounded-pill bg-stone motion-safe:animate-pulse" />
                <span className="size-2 rounded-pill bg-ink motion-safe:animate-pulse" />
              </div>
            )}
            {pending === "waiting" && (
              <span className="self-start text-xs text-graphite">
                Still writing the answer…
              </span>
            )}
            {pending === "lost" && (
              <div
                role="status"
                className="flex flex-col gap-1 rounded-card border border-line bg-paper px-3.5 py-3"
              >
                <span className="text-sm font-bold">
                  The answer didn&apos;t arrive
                </span>
                <span className="text-[13px] leading-normal text-graphite">
                  The connection was lost before the answer was ready.
                </span>
                <button
                  type="button"
                  onClick={() => void tryAgain()}
                  className="mt-1.5 h-10 cursor-pointer self-start rounded-pill border border-ink px-4 text-[13px] font-semibold"
                >
                  Try again
                </button>
              </div>
            )}

            {problem && (
              <div
                role="status"
                className={cn(
                  "flex flex-col gap-1 rounded-card bg-paper px-3.5 py-3",
                  problem.kind === "budget"
                    ? "border-2 border-signal"
                    : "border border-line",
                )}
              >
                <span className="text-sm font-bold">{problem.title}</span>
                <span className="text-[13px] leading-normal text-graphite">
                  {problem.text}
                </span>
                {problem.retry && (
                  <button
                    type="button"
                    onClick={() => void tryAgain()}
                    className="mt-1.5 h-10 cursor-pointer self-start rounded-pill border border-ink px-4 text-[13px] font-semibold"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={submit}
            className="flex shrink-0 flex-col gap-2 border-t border-line bg-paper px-4 pt-3 pb-5"
          >
            {attachError && (
              <span role="alert" className="text-xs text-signal">
                {attachError}
              </span>
            )}
            <div className="flex items-end gap-2">
              {canBatch && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    aria-label="Attach a list (.xlsx or .csv)"
                    accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => void attach(e.target.files?.[0])}
                  />
                  <IconButton
                    label={
                      attaching
                        ? "Reading the list…"
                        : "Attach a list (joiners, leavers or role changes)"
                    }
                    disabled={busy || attaching}
                    onClick={() => fileRef.current?.click()}
                    className="size-12"
                    icon={<PaperclipIcon />}
                  />
                </>
              )}
              <label htmlFor={inputId} className="sr-only">
                Message the assistant
              </label>
              <textarea
                id={inputId}
                ref={inputRef}
                rows={2}
                value={input}
                maxLength={MAX_QUESTION_LENGTH}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  approverOnly
                    ? "Ask a question about the reports or the app"
                    : "Ask about reports, people, access or the app"
                }
                className="min-w-0 flex-1 resize-none rounded-xl border border-field-border bg-paper p-3 text-base leading-snug placeholder:text-stone"
              />
              {busy ? (
                <IconButton
                  label="Stop"
                  variant="solid"
                  icon={<span className="block size-3 rounded-xs bg-paper" />}
                  onClick={() => stop()}
                />
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!input.trim()}
                  className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-ink text-paper disabled:cursor-default disabled:bg-stone"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
            <span className="text-[11px] leading-normal text-graphite">
              The assistant only reads and suggests — it never signs, approves
              or changes anything. It can be wrong: open the source to check.
              Chats are kept 60 days.
            </span>
          </form>
        </>
      )}
    </section>
  );
}

function Bubble({
  from,
  children,
}: {
  from: "user" | "assistant";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // Long links and ticket lists wrap inside the bubble instead of running past it.
        "max-w-[85%] min-w-0 px-3.5 py-3 text-sm leading-normal wrap-anywhere",
        from === "user"
          ? "self-end rounded-[14px_4px_14px_14px] bg-ink text-paper"
          : "self-start rounded-[4px_14px_14px_14px] border border-line bg-paper",
      )}
    >
      {children}
    </div>
  );
}

/** "Needs your Confirm" (board *Confirm creates the draft*). */
function ConfirmCardView({
  card,
  busy,
  onDecide,
}: {
  card: NonNullable<ReturnType<typeof confirmCard>>;
  busy: boolean;
  onDecide: (approved: boolean) => void;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2.5 self-stretch rounded-card border-2 border-ink bg-paper p-3.5"
    >
      <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
        Needs your Confirm
      </span>
      <h3 id={titleId} className="font-serif text-xl leading-tight">
        {card.title}
      </h3>
      <dl className="flex flex-col text-[13px] leading-snug">
        {card.rows.map((row) => (
          <div
            key={row.label}
            className="flex gap-2.5 border-t border-line-subtle py-1.5"
          >
            <dt className="w-24 shrink-0 text-graphite">{row.label}</dt>
            <dd className="min-w-0 wrap-anywhere">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-normal text-graphite">{card.note}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(true)}
          className="min-h-10 rounded-pill bg-ink px-4 text-[13px] font-semibold text-paper disabled:opacity-60"
        >
          {card.yes}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(false)}
          className="min-h-10 rounded-pill border border-field-border px-3.5 text-[13px] font-semibold disabled:opacity-60"
        >
          Not now
        </button>
      </div>
    </section>
  );
}

function Message({
  message,
  busy = false,
  onDecide,
}: {
  message: UIMessage;
  busy?: boolean;
  onDecide?: (approvalId: string, approved: boolean) => void;
}) {
  return (
    <>
      {message.parts.map((part, i) => {
        if (isTextUIPart(part)) {
          if (!part.text.trim()) return null;
          const list = message.role === "user" ? attachedList(part.text) : null;
          if (list)
            return (
              <Bubble key={i} from="user">
                <span className="flex items-center gap-1.5 font-semibold">
                  <PaperclipIcon />
                  {list.fileName}
                </span>
                {list.note && (
                  <span className="mt-1 block whitespace-pre-line">
                    {list.note}
                  </span>
                )}
              </Bubble>
            );
          return message.role === "user" ? (
            <Bubble key={i} from="user">
              <span className="whitespace-pre-line">{part.text}</span>
            </Bubble>
          ) : (
            <Bubble key={i} from="assistant">
              <AnswerText text={part.text} />
            </Bubble>
          );
        }
        if (isToolUIPart(part) && part.state === "approval-requested") {
          const card = confirmCard(getToolName(part), part.input);
          return card && onDecide ? (
            <ConfirmCardView
              key={i}
              card={card}
              busy={busy}
              onDecide={(approved) => onDecide(part.approval.id, approved)}
            />
          ) : null;
        }
        // Refused by the server before any card (something still missing):
        // the robot asks about it in words — nothing to show here.
        if (
          isToolUIPart(part) &&
          (part.state === "output-denied" ||
            part.state === "approval-responded") &&
          part.approval?.isAutomatic
        ) {
          return null;
        }
        if (
          isToolUIPart(part) &&
          (part.state === "output-denied" ||
            (part.state === "approval-responded" && !part.approval.approved))
        ) {
          return (
            <span key={i} className="self-start text-xs text-graphite">
              Not now — nothing was created.
            </span>
          );
        }
        if (isToolUIPart(part)) {
          const done = part.state === "output-available";
          const output = done ? part.output : null;
          const label = toolStep(getToolName(part), done, output);
          if (!label) return null;
          const href = stepLink(output);
          const pdf = stepPdfLink(output);
          const downloads = stepDownloads(output);
          return (
            <span
              key={i}
              className="flex max-w-full flex-wrap items-center gap-x-1.5 self-start text-xs wrap-anywhere text-graphite"
            >
              {done && <CheckIcon size={14} />}
              {label}
              {href && (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    href={href}
                    className="inline-flex min-h-8 items-center font-semibold text-ink underline"
                  >
                    {stepLinkLabel(href)}
                  </Link>
                </>
              )}
              {downloads.map((d) => (
                <span key={d.href} className="contents">
                  <span aria-hidden="true">·</span>
                  {/* Plain links: <Link> would prefetch — and log — a download. */}
                  <a
                    href={d.href}
                    className="inline-flex min-h-8 items-center font-semibold text-ink underline"
                  >
                    {d.label}
                  </a>
                </span>
              ))}
              {pdf && (
                <>
                  <span aria-hidden="true">·</span>
                  {/* A plain link: <Link> would prefetch — and log — a download. */}
                  <a
                    href={pdf}
                    className="inline-flex min-h-8 items-center font-semibold text-ink underline"
                  >
                    Download the PDF
                  </a>
                </>
              )}
            </span>
          );
        }
        return null;
      })}
    </>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6" />
    </svg>
  );
}
