"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  deleteMyAssistantChats,
  forgetMyAssistantMemory,
} from "@/app/(app)/profile/actions";
import { Button, InlineError, Sheet, Toast } from "@/components/ui";
import type { AssistantMemoryView } from "@/lib/profile/assistant-memory";

type Confirm = "memory" | "chats" | null;

const CHAT_KEY = "laine.assistant.chat";

/**
 * My profile → What the assistant remembers (F15d-2d, board Phone · My
 * profile · what the assistant remembers): what the robot keeps about this
 * person, and two buttons that ask first — Clear my memory, Delete my chats.
 */
export function AssistantMemoryCard({
  memory,
}: {
  memory: AssistantMemoryView;
}) {
  const router = useRouter();
  const id = useId();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const empty =
    !memory.callMe &&
    memory.reports.length === 0 &&
    memory.questions.length === 0;

  const run = (what: Exclude<Confirm, null>) =>
    start(async () => {
      setError(null);
      if (what === "memory") {
        const result = await forgetMyAssistantMemory();
        if (!result.ok) return setError(result.message);
        setDone("Your memory is cleared.");
      } else {
        const result = await deleteMyAssistantChats();
        if (!result.ok) return setError(result.message);
        try {
          // The robot's panel starts a new chat next time it opens.
          window.localStorage.removeItem(CHAT_KEY);
        } catch {
          // private window: nothing stored
        }
        setDone(
          result.deleted === 1
            ? "1 chat deleted."
            : `${result.deleted} chats deleted.`,
        );
      }
      setConfirm(null);
      router.refresh();
    });

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4"
    >
      <h2 id={`${id}-title`} className="font-serif text-[21px]">
        What the assistant remembers
      </h2>
      <p className="text-[13px] leading-normal text-graphite">
        So it can greet you and suggest what you use most. It is built from what
        you open and ask — never the text of your chats. Only you see it.
      </p>

      {empty && memory.requestTypes.length === 0 ? (
        <p className="text-sm">
          Nothing yet — it learns as you use the Laine assistant.
        </p>
      ) : (
        <dl className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <dt className="text-xs font-semibold text-graphite">Calls you</dt>
            <dd className="text-[15px] font-semibold">
              {memory.callMe ?? "Your first name (ask it: “call me …”)"}
            </dd>
          </div>
          {memory.reports.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-semibold text-graphite">
                Favourite reports
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {memory.reports.map((r) => (
                  <span
                    key={r}
                    className="rounded-pill bg-sand px-3 py-1.25 text-[13px] font-semibold"
                  >
                    {r}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {memory.questions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-semibold text-graphite">
                Frequent questions
              </dt>
              <dd>
                <ul className="list-disc pl-4.5 text-sm leading-relaxed">
                  {memory.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {memory.requestTypes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-semibold text-graphite">
                Request types you start most
              </dt>
              <dd className="text-sm">{memory.requestTypes.join(" · ")}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="grid grid-cols-2 gap-2 md:flex">
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          onClick={() => setConfirm("memory")}
        >
          Clear my memory
        </Button>
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          onClick={() => setConfirm("chats")}
        >
          Delete my chats
        </Button>
      </div>
      <p className="text-xs leading-normal text-graphite">
        Chats are deleted automatically after 60 days. Both buttons ask before
        deleting anything; deleting is recorded in the audit log (without the
        content).
      </p>

      {confirm && (
        <Sheet
          eyebrow="Laine assistant"
          title={confirm === "memory" ? "Clear my memory?" : "Delete my chats?"}
          onClose={() => setConfirm(null)}
          footer={
            <div className="flex flex-col gap-2 md:flex-row-reverse">
              <Button loading={busy} onClick={() => run(confirm)}>
                {confirm === "memory" ? "Clear my memory" : "Delete my chats"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Keep
              </Button>
            </div>
          }
        >
          <p className="text-sm leading-normal">
            {confirm === "memory"
              ? "The assistant forgets the name it calls you, your favourite reports and your frequent questions. Your chats and everything in the app stay as they are."
              : "Every chat you had with the assistant is deleted and can't be brought back. Your memory and everything in the app stay as they are."}
          </p>
          {error && <InlineError live>{error}</InlineError>}
        </Sheet>
      )}
      {done && <Toast onClose={() => setDone(null)}>{done}</Toast>}
    </section>
  );
}
