import { Fragment, type ReactNode } from "react";

/** **bold** inside a line; everything else stays plain text (React escapes it). */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((piece, i) =>
      piece.startsWith("**") && piece.endsWith("**") && piece.length > 4 ? (
        <strong key={i}>{piece.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{piece}</Fragment>
      ),
    );
}

export type AnswerBlock =
  { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-*•] +/;
const NUMBER = /^\s*\d+[.)] +/;

/**
 * Splits an answer into paragraphs and lists. A list may follow a sentence
 * without a blank line ("You can: \n- Go to …"), and a long item may wrap
 * onto the next line — both are common in the model's answers.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let last: AnswerBlock | null = null;
  for (const raw of text.trim().split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      last = null;
      continue;
    }
    const kind = BULLET.test(line) ? "ul" : NUMBER.test(line) ? "ol" : "p";
    const prev = last as AnswerBlock | null;
    if (kind !== "p") {
      const item = line.replace(kind === "ul" ? BULLET : NUMBER, "");
      if (prev && prev.kind === kind) prev.items.push(item);
      else blocks.push((last = { kind, items: [item] }));
    } else if (prev && prev.kind === "p") {
      prev.text += `\n${line.trim()}`;
    } else if (prev && /^\s{2,}/.test(raw)) {
      // An indented line continues the list item above.
      prev.items[prev.items.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push((last = { kind: "p", text: line.trim() }));
    }
  }
  return blocks;
}

/**
 * The assistant's answer: paragraphs, "- " bullet lists and "1. " numbered
 * lists, **bold** — the little Markdown it writes. No HTML is ever rendered.
 */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {answerBlocks(text).map((block, b) =>
        block.kind === "p" ? (
          <p key={b} className="m-0 whitespace-pre-line">
            {inline(block.text)}
          </p>
        ) : block.kind === "ul" ? (
          <ul key={b} className="list-disc pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <ol key={b} className="list-decimal pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
