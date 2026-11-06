/**
 * Imported people in the reports (F24d-3, pure). They count everywhere like
 * everyone else; a small tag and a footnote say where their dates come from
 * and where their signed form is. An Imported record's ticket is IMP-…
 */
export function isImportedTicket(ticketId: string | null | undefined): boolean {
  return Boolean(ticketId?.startsWith("IMP-"));
}

/** The footnote under a list showing `count` imported people (null = none). */
export function importedNote(count: number): string | null {
  if (count === 0) return null;
  const who = count === 1 ? "1 person here was" : `${count} people here were`;
  return `${who} imported (joined before the app): their dates come from the import file, and the signed form is on SharePoint or attached to their Imported record.`;
}

/** The CSV's Source column. */
export function sourceWords(ticketId: string): string {
  return isImportedTicket(ticketId) ? "Imported" : "App";
}
