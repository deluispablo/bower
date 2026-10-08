// Before merge: does every test an open entry's verify names exist, in a file that command would run?
// usage: node scripts/precheck-verify.mjs [<id>...]    (no id: every open entry)
//   pnpm precheck:verify [<id>...]
// Tests: --tests <json> gives {unit, api, runner, e2e} instead of listing them (the harness test does).
// done.sh runs it before the red. The rules (names, files, packages) are harness-rules.mjs's `problems`, as in check-harness.
import { readFileSync } from 'node:fs';
import { problems } from './harness-rules.mjs';
import { e2eTitles, unitTitles } from './harness-tests.mjs';

const argv = process.argv.slice(2);
const take = (flag) => {
  const i = argv.indexOf(flag);
  return i < 0 ? undefined : argv.splice(i, 2)[1];
};
const featuresPath = take('--features') ?? new URL('../harness/features.json', import.meta.url).pathname;
const testsPath = take('--tests');
const features = JSON.parse(readFileSync(featuresPath, 'utf8'));
const unknown = argv.filter((id) => !features.some((f) => f.id === id));
if (unknown.length) {
  console.error(`No entry ${unknown.join(', ')} in ${featuresPath}.`);
  process.exit(2);
}
const open = features.filter((f) => !f.passes && (argv.length ? argv.includes(f.id) : true));

const kinds = new Set(open.flatMap((f) => [...f.verify.matchAll(/pnpm\s+(?:(?:-C|--dir)\s+(api|runner)\b|e2e)|playwright test|e2e-both/g)].map((m) => m[1] ?? 'e2e')));
if (open.some((f) => /\bvitest run/.test(f.verify) && !/\bpnpm\s+(?:-C|--dir)\s+(?:api|runner)\b[^&]*vitest run/.test(f.verify))) kinds.add('unit');
// Given lists stand in for the listing, so only the kinds the verifies run are kept, as the listing would.
const given = testsPath ? JSON.parse(readFileSync(testsPath, 'utf8')) : null;
const lists = given ? Object.fromEntries(Object.entries(given).map(([k, v]) => [k, kinds.has(k) ? v : []])) : {
  unit: kinds.has('unit') ? unitTitles('.') : [],
  api: kinds.has('api') ? unitTitles('api') : [],
  runner: kinds.has('runner') ? unitTitles('runner') : [],
  e2e: kinds.has('e2e') ? [...e2eTitles(), ...e2eTitles('e2e/pwa.config.ts')] : [],
};
const bad = problems(open, new Map(), lists, new Set(), true);
if (bad.length) {
  console.error(`A verify names tests that do not exist where its command looks (fix the verify or the test name, before merge):\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`precheck ok: ${open.length} open ${open.length === 1 ? 'entry names' : 'entries name'} only tests that exist`);
