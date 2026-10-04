// Keeps the harness honest (docs/harness/METHOD.md); the rules are in harness-rules.mjs.
// Run after `pnpm test` (which writes test-results/unit.json): it also checks that every
// pattern a verify names still matches a test that exists.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { hashOf, LEGACY_HASH, nextProblems, problems, readProofs } from './harness-rules.mjs';

const root = new URL('..', import.meta.url);
const features = JSON.parse(readFileSync(new URL('harness/features.json', root), 'utf8'));
const proofFile = new URL('harness/proof.log', root);
const proofs = readProofs(existsSync(proofFile) ? readFileSync(proofFile, 'utf8') : '');

const unitFile = new URL('test-results/unit.json', root);
const unit = existsSync(unitFile) ? JSON.parse(readFileSync(unitFile, 'utf8')).testResults.flatMap((r) => r.assertionResults.map((a) => a.fullName)) : [];
const e2eTitles = (config) => {
  const out = execSync(`pnpm exec playwright test --list --reporter=json ${config}`, { cwd: new URL('.', root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  const titles = [];
  const walk = (s) => {
    for (const spec of s.specs ?? []) titles.push(spec.title);
    for (const sub of s.suites ?? []) walk(sub);
  };
  for (const s of JSON.parse(out).suites ?? []) walk(s);
  return titles;
};
const e2e = [...e2eTitles(''), ...e2eTitles('-c e2e/pwa.config.ts')];

const legacyText = readFileSync(new URL('harness/proof-legacy.txt', root), 'utf8');
const legacy = new Set(legacyText.split('\n').filter(Boolean));
const bad = problems(features, proofs, unit.length ? { unit, e2e } : undefined, legacy);
const next = nextProblems(readFileSync(new URL('harness/progress.md', root), 'utf8'));
if (next) bad.push(next);
if (hashOf(legacyText) !== LEGACY_HASH) bad.push('harness/proof-legacy.txt changed: the entries proved before the proof rule are frozen');
if (!unit.length) bad.push('no unit test names found: run pnpm test first (it writes test-results/unit.json)');
if (bad.length) {
  console.error(`The harness is not honest yet:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`harness ok: ${features.filter((f) => f.passes).length}/${features.length} entries pass, each with its proof and a test its verify names`);
