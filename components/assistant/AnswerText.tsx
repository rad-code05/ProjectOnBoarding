import { Fragment, type ReactNode } from "react";

/**
 * Markdown the panel doesn't show — links, code marks, italics — becomes
 * plain text. A "**" not yet closed (the answer is still streaming) is
 * hidden, so half-written bold never flashes on screen.
 */
export function plainInline(text: string): string {
  let out = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,:;!?]|$)/g, "$1$2");
  if ((out.match(/\*\*/g) ?? []).length % 2 === 1) {
    const last = out.lastIndexOf("**");
    out = out.slice(0, last) + out.slice(last + 2);
  }
  return out;
}

/** **bold** inside a line; everything else stays plain text (React escapes it). */
function inline(text: string): ReactNode[] {
  return plainInline(text)
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
const HEADING = /^\s*#{1,6} +/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const EMPTY_CELL = /^(|-+|—|none|n\/a)$/i;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * A Markdown table is too wide for the panel: each row becomes one bullet,
 * "**first cell**: Header value · Header value", empty cells left out.
 */
function tableItems(rows: string[][]): string[] {
  const separator = (row: string[]) =>
    row.every((cell) => /^:?-{2,}:?$/.test(cell));
  const body = rows.filter((row) => !separator(row));
  const hasHeader = rows.length > 1 && separator(rows[1]);
  const header = hasHeader ? body[0] : [];
  return (hasHeader ? body.slice(1) : body).map((row) => {
    const [first, ...rest] = row;
    const details = rest
      .map((cell, i) => ({ cell, label: header[i + 1] }))
      .filter(({ cell }) => !EMPTY_CELL.test(cell))
      .map(({ cell, label }) => (label ? `${label}: ${cell}` : cell));
    const name = first && !EMPTY_CELL.test(first) ? `**${first}**` : "";
    return [name, details.join(" · ")].filter(Boolean).join(": ");
  });
}

/**
 * Splits an answer into paragraphs and lists. A list may follow a sentence
 * without a blank line ("You can: \n- Go to …"), and a long item may wrap
 * onto the next line — both are common in the model's answers. Tables turn
 * into lists and headings into bold lines, so every answer reads the same.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let last: AnswerBlock | null = null;
  let table: string[][] = [];
  const endTable = () => {
    if (table.length) blocks.push({ kind: "ul", items: tableItems(table) });
    table = [];
  };
  for (const raw of text.trim().split("\n")) {
    const line = raw.trimEnd();
    if (TABLE_ROW.test(line)) {
      table.push(cells(line));
      last = null;
      continue;
    }
    endTable();
    if (!line.trim()) {
      last = null;
      continue;
    }
    if (HEADING.test(line)) {
      const title = line.replace(HEADING, "").replace(/\*\*/g, "").trim();
      blocks.push({ kind: "p", text: `**${title}**` });
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
  endTable();
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
          <ul key={b} className="list-disc space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <ol key={b} className="list-decimal space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
