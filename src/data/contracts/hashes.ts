/**
 * Telling a file you already have: its SHA-256, worked out in the browser,
 * against `.bower/hashes.json`, which the runner keeps (hash → path).
 */
export async function sha256(b: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
