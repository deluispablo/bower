// One home for an intended create (ARCHITECTURE, mechanism map; c2-create-by-id, c3-reservation-home): only the
// write-once home reserves a Drive id. A syntax rule has one home, ESLint, which already parses every file
// (TL-P4-17 addendum 4); this module is that rule, shared by the app's, the Worker's and the runner's configs.
// Its test (src/reservation-rule.test.ts) feeds it sample source; it never scans the repo inside vitest.

const RESERVING = '/^(generateIds|reserveId)$/';
const SLOT = 'reserved';
/** The types a store of intended creates would hold: the home's port and what it is built on. */
const HOLDERS = '/^(Holder|Intended|JournalRecord|Sending)$/';
const reason = 'Reserve an id for an intended create through write-once (makeOnce, Intended, reserveFor), keeping it on its holder.';
const rule = (selector, what) => ({ selector, message: `${what}: ${reason}` });

/** The syntax that reserves, keeps or hands over a Drive id outside the home. */
export const SELECTORS = [
  // 1. A call for ids, or that call passed on, by any receiver or alias.
  rule(`MemberExpression[computed=false][property.name=${RESERVING}]`, 'calls for ids'),
  rule(`MemberExpression[computed=true][property.value=${RESERVING}]`, 'calls for ids'),
  rule(`CallExpression[callee.name=${RESERVING}]`, 'calls for ids'),
  rule(`ObjectPattern > Property[key.name=${RESERVING}]`, 'takes the call for ids'),
  // 2. The slot set, cleared or given by hand.
  rule(`AssignmentExpression > MemberExpression.left[property.name='${SLOT}']`, 'sets an id by hand'),
  rule(`AssignmentExpression > MemberExpression.left[property.value='${SLOT}']`, 'sets an id by hand'),
  rule(`UnaryExpression[operator='delete'] > MemberExpression[property.name='${SLOT}']`, 'lets an id go by hand'),
  rule(`ObjectExpression > Property[key.name='${SLOT}']`, 'gives an id by hand'),
  // 3. A store of intended creates kept beyond one call.
  ...[
    'PropertyDefinition',
    'Program > VariableDeclaration',
    'Program > ExportNamedDeclaration > VariableDeclaration',
  ].map((kept) => rule(`${kept} NewExpression[callee.name=/^(Map|WeakMap)$/] > TSTypeParameterInstantiation > TSTypeReference[typeName.name=${HOLDERS}]`, 'keeps intended creates outside the home')),
  // 4. The slot's id put in a store by hand.
  rule(`CallExpression[callee.property.name='set']:has(MemberExpression[property.name='${SLOT}'])`, 'stores an id by hand'),
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
    'src/data/upload-queue.ts', // until c3-reservation-upload
    'src/data/drive/seen-files.ts', // passes the call on
    'src/data/fake/fake-run-drive.ts', // passes the call on
    'src/data/drive/fake-drive.ts', // the pretend Drive: its reserved ids and the creates that carry them
  ],
  api: ['src/vault.ts'], // the Worker's template, which fake-worker stands in for
  runner: ['src/drive.ts'], // a per-attempt pool none outlives, and the fenced create that carries its id
};
export const ALLOWED_MAX = 9;

/** The flat-config block for one package: the rule everywhere except the allowed files. */
export const reservationConfig = (pkg) => ({
  files: ['**/*.{ts,tsx}'],
  ignores: [...NOT_PRODUCTION, ...ALLOWED[pkg]],
  rules: { 'no-restricted-syntax': ['error', ...SELECTORS] },
});
