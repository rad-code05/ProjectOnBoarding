/** Every IANA timezone the browser knows, with the given ones included. */
export function timezoneList(extra: string[] = []): string[] {
  const all =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return [...new Set([...all, ...extra])].sort();
}
