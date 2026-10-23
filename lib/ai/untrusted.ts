/**
 * Guardrail 2 (PROJECT_PLAN §6.6): anything that doesn't come from us —
 * uploaded files, pasted text, text from the database — goes to the model
 * fenced as data, never as instructions. The fence can't be closed from
 * inside: a closing tag in the content is defused.
 */
export function asData(source: string, content: string): string {
  const label = source.replace(/[^\w .·:/-]/g, "").slice(0, 80) || "data";
  const safe = content.replace(/<\/?\s*untrusted-data\b[^>]*>/gi, (tag) =>
    tag.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  );
  return `<untrusted-data source="${label}">\n${safe}\n</untrusted-data>`;
}
