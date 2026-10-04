/** A pasted link, made whole: "example.com/x" becomes "https://example.com/x". */
export function normaliseLink(raw: string): string | null {
  const v = raw.trim();
  if (!v || /\s/.test(v)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}
