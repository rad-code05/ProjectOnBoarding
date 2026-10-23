"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
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
import { CheckIcon, CloseIcon, IconButton } from "@/components/ui";
import type { Role } from "@/lib/auth";
import {
  MAX_QUESTION_LENGTH,
  chatProblem,
  greeting,
  starterQuestions,
  stepLink,
  toolStep,
} from "@/lib/ai/chat-ui";
import { cn } from "@/lib/cn";
import { loadAssistantChat } from "./actions";
import { AnswerText } from "./AnswerText";
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

const CHAT_KEY = "laine.assistant.chat";
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
export function Assistant({ name, roles }: { name: string; roles: Role[] }) {
  // Open / closed from this device's storage; closed on the server.
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => false);
  const launcher = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  // Above the request form's sticky Save / Review & sign bar.
  const lifted = /^\/requests\/[^/]+$/.test(pathname);

  const show = (next: boolean) => {
    writeOpen(next);
    if (!next) requestAnimationFrame(() => launcher.current?.focus());
  };

  return (
    <>
      {/* Room at the end of the page, so the robot never covers its last
          buttons (Show more, Save …) once scrolled to the bottom. */}
      <div aria-hidden="true" className="h-18" />
      {!open && (
        <button
          ref={launcher}
          type="button"
          aria-label="Open the Laine assistant"
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
  const [restored] = useState(readChatId);
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

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // Only the new question travels; the server loads the history.
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, message: messages[messages.length - 1] },
        }),
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
  } = useChat({
    id: chatId,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const problem = error ? chatProblem(error.message, timeZone) : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, [chatId]);
  useEffect(() => {
    // Only the chat from last time; New chat (or leaving) drops a late answer.
    if (!restored || chatId !== restored) return;
    let current = true;
    void loadAssistantChat(restored).then((saved) => {
      // Unless a question was already asked meanwhile.
      if (current && saved.length) {
        setMessages((now) => (now.length ? now : saved));
      }
    });
    return () => {
      current = false;
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
  const newChat = () => {
    stop();
    const id = crypto.randomUUID();
    writeChatId(id);
    setChatId(id);
    setInput("");
  };

  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-60 flex flex-col bg-sand md:inset-y-0 md:right-0 md:left-auto md:w-95 md:border-l md:border-line md:shadow-[-8px_0_24px_rgba(0,0,0,0.08)]"
    >
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
          <Message key={m.id} message={m} />
        ))}

        {status === "submitted" && (
          <div
            aria-label="The assistant is writing"
            className="flex gap-1.5 self-start rounded-[4px_14px_14px_14px] border border-line bg-paper px-4 py-3"
          >
            <span className="size-2 rounded-pill bg-ink motion-safe:animate-pulse" />
            <span className="size-2 rounded-pill bg-stone motion-safe:animate-pulse" />
            <span className="size-2 rounded-pill bg-ink motion-safe:animate-pulse" />
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
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
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
        <div className="flex items-end gap-2">
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
          The assistant only reads and suggests — it never signs, approves or
          changes anything. It can be wrong: open the source to check. Chats are
          kept 60 days.
        </span>
      </form>
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

function Message({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, i) => {
        if (isTextUIPart(part)) {
          if (!part.text.trim()) return null;
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
        if (isToolUIPart(part)) {
          const done = part.state === "output-available";
          const output = done ? part.output : null;
          const href = stepLink(output);
          return (
            <span
              key={i}
              className="flex max-w-full flex-wrap items-center gap-x-1.5 self-start text-xs wrap-anywhere text-graphite"
            >
              {done && <CheckIcon size={14} />}
              {toolStep(getToolName(part), done, output)}
              {href && (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    href={href}
                    className="inline-flex min-h-8 items-center font-semibold text-ink underline"
                  >
                    Open the report
                  </Link>
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
