/**
 * Model input normalization for fingerprinting (TL-P4-07 addendum 2):
 * normalize run-dependent values (run IDs, file IDs, timestamps) so that
 * the same case run twice with different IDs produces the same fingerprint.
 */

interface PileItem { fileId: string; name: string; kind: string; text: string | null; cut: number; why?: string; pagesNotRead?: number }
interface Pile { pileId: string; words: string; things: PileItem[] }

/**
 * Normalize the model input for fingerprinting by replacing run-dependent values
 * and sorting things within piles to ensure deterministic ordering regardless of
 * creation order or Drive listing order.
 */
export function normalizeModelInput(input: string): string {
  const normalized = input
    .replace(/"runId":"[^"]+"/g, '"runId":"RUN_ID"')
    .replace(/"admission":"[^"]+"/g, '"admission":"ADMISSION_ID"')
    .replace(/"pileId":"[^"]+"/g, '"pileId":"PILE_ID"')
    .replace(/"fileId":"[^"]+"/g, '"fileId":"FILE_ID"')
    .replace(/"id":"[^"]+"/g, '"id":"ID"')
    .replace(/"at":\d+/g, '"at":0');

  // Also normalize the order of things in piles to account for different Drive listing orders
  // Parse as JSON, sort things within each pile, and stringify back
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const firstItem = parsed[0] as Record<string, unknown>;
      if ('pileId' in firstItem) {
        // This is a piles array
        const sorted = (parsed as Pile[]).map((pile) => ({
          ...pile,
          things: Array.isArray(pile.things) ? [...pile.things].sort((a, b) => {
            // Sort by name first, then by kind
            const nameComp = (a.name ?? '').localeCompare(b.name ?? '');
            return nameComp !== 0 ? nameComp : (a.kind ?? '').localeCompare(b.kind ?? '');
          }) : pile.things
        }));
        return JSON.stringify(sorted);
      }
    }
  } catch {
    // If parsing fails, just return the replaced string
  }

  return normalized;
}
