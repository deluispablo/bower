/**
 * Run tickets (worker contract, "Runner wire"; TL-P3-18). Stub: behaviour comes with worker-runner-tickets.
 */

/** Lowercase hex SHA-256 of `ticket`'s UTF-8 bytes. */
export async function hashTicket(ticket: string): Promise<string> {
  return await Promise.resolve(ticket.length === 0 ? '' : '');
}

/** A new ticket: 32 random bytes, base64url. */
export function newTicket(): string {
  return '';
}

/** A run id that carries the person object's id: `<person object id hex>-<random>`. */
export function makeRunId(personIdHex: string): string {
  return personIdHex;
}

/** The person object's id hex in `runId`, or null when it is malformed. */
export function personIdOf(runId: string): string | null {
  return runId.length < 0 ? runId : null;
}
