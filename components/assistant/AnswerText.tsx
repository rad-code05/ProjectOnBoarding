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
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

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
 * A Markdown table → a real table (header + rows). Without the "---" line
 * under the first row, every row is data. Empty / "None" cells show "—".
 */
function tableBlock(rows: string[][]): AnswerBlock {
  const separator = (row: string[]) =>
    row.every((cell) => /^:?-{2,}:?$/.test(cell));
  const hasHeader = rows.length > 1 && separator(rows[1]);
  const body = rows.filter((row) => !separator(row));
  const tidy = (row: string[]) =>
    row.map((cell) => (EMPTY_CELL.test(cell) ? "—" : cell));
  return {
    kind: "table",
    header: hasHeader ? body[0] : [],
    rows: (hasHeader ? body.slice(1) : body).map(tidy),
  };
}

/**
 * Splits an answer into paragraphs and lists. A list may follow a sentence
 * without a blank line ("You can: \n- Go to …"), and a long item may wrap
 * onto the next line — both are common in the model's answers. Tables stay
 * tables (asked for "columns and rows"); headings become bold lines.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let last: AnswerBlock | null = null;
  let table: string[][] = [];
  const endTable = () => {
    if (table.length) blocks.push(tableBlock(table));
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
      if (prev && prev.kind === kind && "items" in prev) prev.items.push(item);
      else blocks.push((last = { kind, items: [item] }));
    } else if (prev && prev.kind === "p") {
      prev.text += `\n${line.trim()}`;
    } else if (prev && "items" in prev && /^\s{2,}/.test(raw)) {
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
 * lists, small tables, **bold** — the little Markdown it writes. No HTML is
 * ever rendered.
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
        ) : block.kind === "ol" ? (
          <ol key={b} className="list-decimal space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ol>
        ) : (
          // Wider than the bubble on a phone: the box scrolls sideways.
          <div
            key={b}
            role="region"
            aria-label="Table"
            tabIndex={0}
            className="max-w-full overflow-x-auto rounded-lg border border-line"
          >
            <table className="w-full border-collapse text-[13px] leading-snug wrap-normal">
              {block.header.length > 0 && (
                <thead className="bg-sand">
                  <tr>
                    {block.header.map((cell, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="border-b border-line px-2.5 py-1.5 text-left font-semibold whitespace-nowrap"
                      >
                        {inline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-t border-line first:border-t-0">
                    {row.map((cell, i) => (
                      <td key={i} className="min-w-24 px-2.5 py-1.5 align-top">
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}
