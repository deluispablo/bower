/**
 * Model input normalization for fingerprinting (TL-P4-07 addendum 2):
 * normalize run-dependent values (run IDs, file IDs, timestamps) so that
 * the same case run twice with different IDs produces the same fingerprint.
 */

/**
 * Normalize the model input for fingerprinting by replacing run-dependent values.
 * Only run-dependent ids and times are replaced; the normalized input is identical
 * except for these fields.
 */
export function normalizeModelInput(input: string): string {
  return input
    .replace(/"runId":"[^"]+"/g, '"runId":"RUN_ID"')
    .replace(/"id":"[^"]+"/g, '"id":"ID"')
    .replace(/"at":\d+/g, '"at":0');
}
