// Keeps the harness honest (docs/harness/METHOD.md); the rules are in harness-rules.mjs.
// Run after `pnpm test` (which writes test-results/unit.json): it also checks that every
// pattern a verify names still matches a test that exists.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quarantineFileProblems } from './e2e-flaky.mjs';
import { e2eTitles } from './harness-tests.mjs';
import { agentDefProblems } from './check-agent-defs.mjs';
import { hookScriptProblems } from './check-hook-scripts.mjs';
import { historyTips } from './harness-git.mjs';
import { apiTests, conflictMarkers, cpuReport, hashOf, LEGACY_HASH, nextProblems, problems, readProofs, runnerTests, slowReport, testsChangedProblems, timerListProblems } from './harness-rules.mjs';

const root = new URL('..', import.meta.url);
// Before anything slow: a committed conflict marker breaks the build in ways that read as something else.
const markers = conflictMarkers(fileURLToPath(root));
if (markers.length) {
  console.error(`The harness is not honest yet:\n  ${markers.join('\n  ')}`);
  process.exit(1);
}
// The e2e quarantine (TL-P4-20): every entry has an owner, an unexpired date and a logged defect. `--quarantine <file> [--defect-log <file>]` runs only this rule.
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const quarantine = quarantineFileProblems(arg('--quarantine'), arg('--defect-log'));
if (quarantine.length) {
  console.error(`The harness is not honest yet:\n  ${quarantine.join('\n  ')}`);
  process.exit(1);
}
if (arg('--quarantine')) process.exit(0);
// A changed test needs its own line (TL-P4-20). `--tests-changed <base>` runs only this rule, for integrate.sh, before its slow check.
const flag = process.argv.indexOf('--tests-changed');
const tampered = testsChangedProblems(flag >= 0 ? process.argv[flag + 1] : 'claude/p3', historyTips());
if (tampered.length) {
  console.error(`The harness is not honest yet:\n  ${tampered.join('\n  ')}`);
  process.exit(1);
}
if (flag >= 0) process.exit(0);
const missingHooks = [...hookScriptProblems(fileURLToPath(root)), ...agentDefProblems(fileURLToPath(root))];
if (missingHooks.length) {
  console.error(`The harness is not honest yet:\n  ${missingHooks.join('\n  ')}`);
  process.exit(1);
}
const features = JSON.parse(readFileSync(new URL('harness/features.json', root), 'utf8'));
const proofFile = new URL('harness/proof.log', root);
const proofs = readProofs(existsSync(proofFile) ? readFileSync(proofFile, 'utf8') : '');

const unitFile = new URL('test-results/unit.json', root);
const unit = existsSync(unitFile) ? JSON.parse(readFileSync(unitFile, 'utf8')).testResults.flatMap((r) => r.assertionResults.map((a) => ({ name: a.fullName, path: [...a.ancestorTitles, a.title].join(' > '), duration: a.duration ?? 0, file: relative(process.cwd(), r.name), config: 'vite.config.ts', project: r.projectName ?? '' }))) : [];
const e2e = [...e2eTitles(), ...e2eTitles('e2e/pwa.config.ts')];

const legacyText = readFileSync(new URL('harness/proof-legacy.txt', root), 'utf8');
const legacy = new Set(legacyText.split('\n').filter(Boolean));
const bad = problems(features, proofs, unit.length ? { unit, e2e, api: apiTests(fileURLToPath(root)), runner: runnerTests(fileURLToPath(root)) } : undefined, legacy);
const next = nextProblems(readFileSync(new URL('harness/progress.md', root), 'utf8'));
if (next) bad.push(next);
if (hashOf(legacyText) !== LEGACY_HASH) bad.push('harness/proof-legacy.txt changed: the entries proved before the proof rule are frozen');
if (unit.length) {
  const all = [...unit, ...apiTests(fileURLToPath(root)), ...runnerTests(fileURLToPath(root))];
  bad.push(...timerListProblems(all.map((t) => t.name), JSON.parse(readFileSync(new URL('harness/real-timers.json', root), 'utf8')).tests));
}
if (!unit.length) bad.push('no unit test names found: run pnpm test and pnpm -C api test first (they write test-results/unit.json)');
if (bad.length) {
  console.error(`The harness is not honest yet:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
// Wall-clock time is a report, never a failure (TL-P4-17 addendum 9).
if (unit.length) console.log(`slowest unit tests (report only):\n  ${slowReport(unit).join('\n  ')}`);
const cpuDir = new URL('test-results/cpu/', root);
const cpuRows = existsSync(cpuDir) ? readdirSync(cpuDir).flatMap((f) => JSON.parse(readFileSync(new URL(f, cpuDir), 'utf8'))) : [];
if (cpuRows.length) console.log(`most CPU used by a unit test (report only):\n  ${cpuReport(cpuRows).join('\n  ')}`);
console.log(`harness ok: ${features.filter((f) => f.passes).length}/${features.length} entries pass, each with its proof and a test its verify names`);
