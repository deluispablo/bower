/**
 * Model input normalization for fingerprinting (TL-P4-07 addendum 2, TL-P4-14 stage 3 row): run-dependent values
 * (run IDs, admission IDs, pile and file IDs, item IDs, timestamps) are set to fixed values at any depth, so the same
 * case run twice with other ids gives the same fingerprint. JSON lines are parsed and their keys set, never
 * regex-edited, so a text value that looks like an id is kept. Each JSON line is written in canonical form: object
 * keys sorted by UTF-16 code units, no insignificant whitespace (RFC 8785, JSON Canonicalization Scheme; JSON.stringify
 * already gives the ECMAScript number and string forms RFC 8785 requires). Lines that are not JSON are kept as written.
 * The model input itself is not changed.
 */
const FIXED: Readonly<Record<string, string | number>> = {
  runId: 'RUN_ID',
  admission: 'ADMISSION_ID',
  pileId: 'PILE_ID',
  fileId: 'FILE_ID',
  itemId: 'ITEM_ID',
  folderId: 'FOLDER_ID',
  parentId: 'FOLDER_ID',
  version: 'VERSION',
  id: 'ID',
  at: 0,
};

function fixKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fixKeys);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    // Type-row ids are stable configuration, rather than physical ids assigned to this run.
    if (key === 'types') out[key] = inner;
    else if (['indexed', 'foldersById', 'allowedTargets'].includes(key) && inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      // Dictionary keys are physical ids too. Keep every row, ordered by its stable content.
      out[key] = Object.fromEntries(Object.values(inner).map(fixKeys)
        .sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0)
        .map((row, index) => [`ID_${index}`, row]));
    } else out[key] = Object.prototype.hasOwnProperty.call(FIXED, key) ? FIXED[key] : fixKeys(inner);
  }
  return out;
}

/** RFC 8785 canonical form of a parsed JSON value (keys sorted by UTF-16 code units, the default string order). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`);
  return `{${members.join(',')}}`;
}

function normalizeLine(line: string): string {
  if (!line.startsWith('{') && !line.startsWith('[')) return line;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  return canonical(fixKeys(parsed));
}

export function normalizeModelInput(input: string): string {
  return input.split('\n').map(normalizeLine).join('\n');
}
