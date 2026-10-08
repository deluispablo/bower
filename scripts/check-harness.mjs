// Keeps the harness honest (docs/harness/METHOD.md); the rules are in harness-rules.mjs.
// Run after `pnpm test` (which writes test-results/unit.json): it also checks that every
// pattern a verify names still matches a test that exists.
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { e2eTitles } from './harness-tests.mjs';
import { apiTests, hashOf, LEGACY_HASH, nextProblems, problems, readProofs, runnerTests } from './harness-rules.mjs';

const root = new URL('..', import.meta.url);
const features = JSON.parse(readFileSync(new URL('harness/features.json', root), 'utf8'));
const proofFile = new URL('harness/proof.log', root);
const proofs = readProofs(existsSync(proofFile) ? readFileSync(proofFile, 'utf8') : '');

const unitFile = new URL('test-results/unit.json', root);
const unit = existsSync(unitFile) ? JSON.parse(readFileSync(unitFile, 'utf8')).testResults.flatMap((r) => r.assertionResults.map((a) => ({ name: a.fullName, file: relative(process.cwd(), r.name), config: 'vite.config.ts', project: r.projectName ?? '' }))) : [];
const e2e = [...e2eTitles(), ...e2eTitles('e2e/pwa.config.ts')];

const legacyText = readFileSync(new URL('harness/proof-legacy.txt', root), 'utf8');
const legacy = new Set(legacyText.split('\n').filter(Boolean));
const bad = problems(features, proofs, unit.length ? { unit, e2e, api: apiTests(fileURLToPath(root)), runner: runnerTests(fileURLToPath(root)) } : undefined, legacy);
const next = nextProblems(readFileSync(new URL('harness/progress.md', root), 'utf8'));
if (next) bad.push(next);
if (hashOf(legacyText) !== LEGACY_HASH) bad.push('harness/proof-legacy.txt changed: the entries proved before the proof rule are frozen');
if (!unit.length) bad.push('no unit test names found: run pnpm test and pnpm -C api test first (they write test-results/unit.json)');
if (bad.length) {
  console.error(`The harness is not honest yet:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`harness ok: ${features.filter((f) => f.passes).length}/${features.length} entries pass, each with its proof and a test its verify names`);
