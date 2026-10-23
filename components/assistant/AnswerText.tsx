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

/**
 * The assistant's answer: paragraphs, "- " bullet lists and "1. " numbered
 * lists, **bold** — the little Markdown it writes. No HTML is ever rendered.
 */
export function AnswerText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={b} className="list-disc pl-5">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*] /, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.length && lines.every((l) => /^\s*\d+[.)] /.test(l))) {
          return (
            <ol key={b} className="list-decimal pl-5">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*\d+[.)] /, ""))}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={b} className="m-0 whitespace-pre-line">
            {inline(lines.join("\n"))}
          </p>
        );
      })}
    </div>
  );
}
