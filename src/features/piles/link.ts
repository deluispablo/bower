/** A pasted link, made whole: "example.com/x" becomes "https://example.com/x". */
export function normaliseLink(raw: string): string | null {
  const v = raw.trim();
  if (!v || /\s/.test(v)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    // Only http(s) without credentials is a web address (WHATWG URL Standard).
    const web = (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password;
    return web && u.hostname.includes('.') ? u.toString() : null;
  } catch {
    // expected: not a link; the person is told so by the caller.
    return null;
  }
}
