/**
 * The operator's allowlist in KV, reused from the original app's store:
 * one `allow:<address>` key per invited address, case-insensitive. KV keeps
 * only this list; everything about a person lives in their person object.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The KV key for `email` on the allowlist. */
export function allowKey(email: string): string {
  return `allow:${normalizeEmail(email)}`;
}

/** Whether `email` (case-insensitive) is on the operator's allowlist. */
export async function isAllowed(kv: KVNamespace, email: string): Promise<boolean> {
  return (await kv.get(allowKey(email))) === '1';
}
