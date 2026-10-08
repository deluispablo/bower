/**
 * Model input normalization for fingerprinting (TL-P4-07 addendum 2):
 * normalize run-dependent values (run IDs, file IDs, timestamps) so that
 * the same case run twice with different IDs produces the same fingerprint.
 * The order of a pile's things is fixed where the input is prepared, not here.
 */
export function normalizeModelInput(input: string): string {
  return input
    .replace(/"runId":"[^"]+"/g, '"runId":"RUN_ID"')
    .replace(/"admission":"[^"]+"/g, '"admission":"ADMISSION_ID"')
    .replace(/"pileId":"[^"]+"/g, '"pileId":"PILE_ID"')
    .replace(/"fileId":"[^"]+"/g, '"fileId":"FILE_ID"')
    .replace(/"id":"[^"]+"/g, '"id":"ID"')
    .replace(/"at":\d+/g, '"at":0');
}
