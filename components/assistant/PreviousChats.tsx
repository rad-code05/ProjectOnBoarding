"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { deleteMyAssistantChats } from "@/app/(app)/profile/actions";
import {
  ChevronLeftIcon,
  IconButton,
  InlineError,
  TrashIcon,
} from "@/components/ui";
import { chatGroups, type ChatSummary } from "@/lib/ai/chat-ui";
import { deleteAssistantChat, listAssistantChats } from "./actions";

/**
 * Previous chats (F15d-2e, board Phone · Assistant · Previous chats): the
 * person's own chats grouped Today / This week / Older; tap one to continue
 * it, delete one (asks in the row) or all of them (asks first).
 */
export function PreviousChats({
  currentId,
  timeZone,
  onOpen,
  onNewChat,
  onBack,
  onDeleted,
}: {
  currentId: string;
  timeZone: string;
  onOpen: (id: string) => void;
  onNewChat: () => void;
  onBack: () => void;
  /** A chat (or "all") is gone — the panel starts fresh if it was open. */
  onDeleted: (id: string | "all") => void;
}) {
  const titleId = useId();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [confirm, setConfirm] = useState<string | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let current = true;
    void listAssistantChats().then((list) => {
      if (current) setChats(list);
    });
    return () => {
      current = false;
    };
  }, []);

  const groups = useMemo(
    () => (chats ? chatGroups(chats, timeZone) : []),
    [chats, timeZone],
  );

  const remove = (what: string | "all") =>
    start(async () => {
      setError(null);
      const ok =
        what === "all"
          ? (await deleteMyAssistantChats()).ok
          : await deleteAssistantChat(what);
      if (!ok) {
        setError("Could not delete. Try again.");
        return;
      }
      setChats((list) =>
        what === "all" ? [] : (list ?? []).filter((c) => c.id !== what),
      );
      setConfirm(null);
      onDeleted(what);
    });

  const confirmRow = (title: string, onYes: () => void) => (
    <div role="alert" className="flex flex-col gap-2 px-3.5 py-3">
      <span className="text-sm font-semibold">Delete “{title}”?</span>
      <span className="text-xs leading-normal text-graphite">
        It can&apos;t be brought back. Your memory and reports are not affected.
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onYes}
          disabled={busy}
          className="h-10 cursor-pointer rounded-pill bg-ink px-4 text-[13px] font-semibold text-paper disabled:bg-stone"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setConfirm(null)}
          className="h-10 cursor-pointer rounded-pill border border-ink px-4 text-[13px] font-semibold"
        >
          Keep
        </button>
      </span>
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-paper py-2.5 pr-2 pl-1">
        <IconButton
          label="Back to the chat"
          icon={<ChevronLeftIcon size={20} />}
          variant="ghost"
          onClick={onBack}
        />
        <h2 id={titleId} className="flex-1 font-serif text-xl leading-tight">
          Previous chats
        </h2>
        <button
          type="button"
          onClick={onNewChat}
          className="h-10 cursor-pointer rounded-pill border border-field-border px-3 text-[13px] font-semibold"
        >
          New chat
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        {chats === null ? (
          <p className="text-sm text-graphite">Loading your chats…</p>
        ) : chats.length === 0 ? (
          <p className="text-sm">No chats yet — ask the assistant something.</p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-bold tracking-widest text-graphite uppercase">
                {group.label}
              </h3>
              <ul className="overflow-hidden rounded-card border border-line bg-paper">
                {group.chats.map((chat) => (
                  <li
                    key={chat.id}
                    className="border-t border-line first:border-t-0"
                  >
                    {confirm === chat.id ? (
                      confirmRow(chat.title, () => remove(chat.id))
                    ) : (
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => onOpen(chat.id)}
                          aria-current={chat.id === currentId || undefined}
                          className="flex min-h-15 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 py-2.5 pr-1.5 pl-3.5 text-left"
                        >
                          <span className="truncate text-sm font-semibold">
                            {chat.title}
                          </span>
                          <span className="text-xs text-graphite">
                            {chat.when} ·{" "}
                            {chat.messages === 1
                              ? "1 message"
                              : `${chat.messages} messages`}
                          </span>
                        </button>
                        {chat.id === currentId && (
                          <span className="shrink-0 rounded-pill border border-ink px-2 py-0.75 text-[11px] font-bold">
                            Open now
                          </span>
                        )}
                        <IconButton
                          label={`Delete “${chat.title}”`}
                          icon={<TrashIcon size={18} />}
                          variant="ghost"
                          onClick={() => setConfirm(chat.id)}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {error && <InlineError live>{error}</InlineError>}

        {chats !== null && chats.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            {confirm === "all" ? (
              <div className="rounded-card border border-line bg-paper">
                {confirmRow("all my chats", () => remove("all"))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm("all")}
                className="h-11 cursor-pointer self-start rounded-pill border border-ink px-4.5 text-sm font-semibold"
              >
                Delete all my chats
              </button>
            )}
            <span className="text-xs leading-normal text-graphite">
              Only your own chats are listed. Chats are deleted automatically 60
              days after their last message. Deleting asks first and is recorded
              in the audit log, without the content.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
