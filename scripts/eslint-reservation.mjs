// One home for an intended create (ARCHITECTURE, mechanism map; c2-create-by-id, c3-reservation-home): only the
// write-once home reserves a Drive id. A syntax rule has one home, ESLint, which already parses every file
// (TL-P4-17 addendum 4); this module is that rule, shared by the app's, the Worker's and the runner's configs.
// Its test (src/reservation-rule.test.ts) feeds it sample source; it never scans the repo inside vitest.

// The rule names the primitive: the call that reserves an id (`generateIds`, write-once's `reserveId`) and the create that
// takes a reserved id by hand (`createById`). It never names what holds an id (a holder type, a map, a slot): a rename
// hides those (P4-39), and a call cannot be renamed away by a type. The home's own makers (makeOnce, makeFolder, makeText,
// reserveFor, Intended) are what everyone else uses.
const RESERVING = '/^(generateIds|reserveId|createById)$/';
const reason = 'Reserve an id for an intended create through write-once (makeOnce, makeFolder, makeText, Intended, reserveFor), keeping it on its holder.';
const rule = (selector, what) => ({ selector, message: `${what}: ${reason}` });

/** The syntax that reserves an id, or creates by a reserved one, outside the home: the call, or the call passed on, by any receiver or alias. */
export const SELECTORS = [
  rule(`MemberExpression[computed=false][property.name=${RESERVING}]`, 'calls for ids'),
  rule(`MemberExpression[computed=true][property.value=${RESERVING}]`, 'calls for ids'),
  rule(`CallExpression[callee.name=${RESERVING}]`, 'calls for ids'),
  rule(`ObjectPattern > Property[key.name=${RESERVING}]`, 'takes the call for ids'),
];

/** Test files, test helpers' fixtures and e2e are not production code. */
const NOT_PRODUCTION = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'test/**'];

/**
 * Who may reserve outside the home, per package (paths from that package's own root). This list may only shrink:
 * `src/reservation-rule.test.ts` fails when it grows past ALLOWED_MAX.
 */
export const ALLOWED = {
  root: [
    'src/data/spine/write-once.ts', // the home
    'src/data/spine/engine.ts', // one batch for a run's creates; one id for a create the batch did not cover
    'src/data/fake/fake-worker.ts', // the template's batch
    'src/data/drive/seen-files.ts', // passes the call on
    'src/data/fake/fake-run-drive.ts', // passes the call on
    'src/data/drive/fake-drive.ts', // the pretend Drive: its reserved ids and the creates that carry them
  ],
  api: [],
  runner: ['src/drive.ts'], // a per-attempt pool none outlives, and the fenced create that carries its id
};
export const ALLOWED_MAX = 7;

/** The flat-config block for one package: the rule everywhere except the allowed files. */
export const reservationConfig = (pkg) => ({
  files: ['**/*.{ts,tsx}'],
  ignores: [...NOT_PRODUCTION, ...ALLOWED[pkg]],
  rules: { 'no-restricted-syntax': ['error', ...SELECTORS] },
});
