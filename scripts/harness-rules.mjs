// The harness's rules, pure, so they are tested (src/harness.test.ts) and used by
// scripts/check-harness.mjs and harness/done.sh alike.
import { createHash } from 'node:crypto';

/** The hash a proof line keeps for a verify command. */
export const hashOf = (verify) => createHash('sha256').update(verify).digest('hex').slice(0, 16);

/** proof.log lines → Map(id → { hash, how }); a later line for an id wins. */
export function readProofs(text) {
  const out = new Map();
  for (const line of text.split('\n').filter(Boolean)) {
    const [id, hash, , how = ''] = line.split('\t');
    out.set(id, { hash, how });
  }
  return out;
}

/** The test patterns a verify names: vitest -t "…" and playwright -g "…". */
function patterns(part) {
  const m = / -(t|g) "([^"]*)"/.exec(part);
  return m ? { kind: m[1] === 't' ? 'unit' : 'e2e', pattern: m[2] } : null;
}

/**
 * Everything that makes the feature list dishonest, one sentence each.
 * `tests` (the names of the unit and e2e tests that exist) lets it check that
 * every named pattern still matches a test.
 */
/** The hash of harness/proof-legacy.txt: the entries proved before the proof rule. Frozen; growing it means changing this line. */
export const LEGACY_HASH = '837283d24771c394';

export function problems(features, proofs, tests, legacy = new Set()) {
  const bad = [];
  for (const f of features) {
    const proof = proofs.get(f.id);
    if (f.passes && proof?.hash !== hashOf(f.verify)) bad.push(`${f.id}: passes without a proof for its current verify (close it with harness/done.sh)`);
    if (f.passes && proof?.how === 'reproved' && typeof f.task !== 'number' && !legacy.has(f.id)) bad.push(`${f.id}: a "reproved" proof is only for the entries before the proof rule; close it with harness/done.sh`);
    if (typeof f.task !== 'string') continue;
    if (!Array.isArray(f.steps) || !f.steps.some((x) => typeof x === 'string' && x.trim())) bad.push(`${f.id}: no steps (how a person sees it, for an evaluator to replay)`);
    for (const p of f.verify.split('&&').map((x) => x.trim())) {
      const named = /vitest run|playwright test|e2e-both/.test(p);
      if (!named) continue;
      const pat = patterns(p);
      if (!pat) {
        bad.push(`${f.id}: "${p}" names no test (add -t "<test name>" or -g "<test name>")`);
        continue;
      }
      if (pat.pattern.replace(/[.^$|()\\[\]*+?]/g, '').length < 4) {
        bad.push(`${f.id}: pattern "${pat.pattern}" is too short to name a test`);
        continue;
      }
      if (tests && f.passes) {
        let re;
        try {
          re = new RegExp(pat.pattern);
        } catch {
          bad.push(`${f.id}: pattern "${pat.pattern}" is not a valid pattern`);
          continue;
        }
        if (!tests[pat.kind].some((name) => re.test(name))) bad.push(`${f.id}: pattern "${pat.pattern}" matches no test (${pat.kind})`);
      }
    }
  }
  return bad;
}

/** Entries other than `id` whose `passes` changed since `before` (one entry per commit). */
export function othersFlipped(before, now, id) {
  const was = new Map(before.map((x) => [x.id, x.passes]));
  return now.filter((x) => x.id !== id && was.has(x.id) && was.get(x.id) !== x.passes).map((x) => x.id);
}

/**
 * done.sh's arguments: <id> "<message>" and at most one of
 *   --fixed-in <sha>   the fix is that commit: the red step puts its code back as it was before it;
 *   --known-green "<why>"  no red is possible (a decision kept, a finding not reproduced); the entry needs a note.
 * Anything else is refused, so a mistyped flag never skips the red step.
 */
export function doneArgs(argv, entry) {
  const [id, msg, flag, value, ...rest] = argv;
  if (!id || !msg) throw new Error('usage: done.sh <id> "<message>" [--fixed-in <sha> | --known-green "<why>"]');
  if (rest.length) throw new Error(`unknown arguments: ${rest.join(' ')}`);
  if (!flag) return { id, msg, mode: 'red' };
  if (flag === '--fixed-in') {
    if (!value || !/^[0-9a-f]{7,40}$/.test(value)) throw new Error('--fixed-in needs a commit');
    return { id, msg, mode: 'fixed-in', sha: value };
  }
  if (flag === '--known-green') {
    if (!value) throw new Error('--known-green needs a reason');
    if (!entry?.note) throw new Error('--known-green needs the entry to carry a note saying why');
    return { id, msg, mode: 'known-green', reason: value };
  }
  throw new Error(`unknown flag ${flag}`);
}

/**
 * Paths from `git status --porcelain` with changes not staged (the harness's own
 * records aside). done.sh commits only what is staged, so it refuses these: one
 * entry's commit never carries another change by accident.
 */
export function notStaged(status) {
  return status
    .split('\n')
    .filter(Boolean)
    .filter((l) => l.startsWith('??') || l[1] !== ' ')
    .map((l) => l.slice(3))
    .filter((p) => !p.startsWith('harness/'));
}

/** harness/progress.md must say what comes next: a "## Next" section with at least one line. */
export function nextProblems(text) {
  const m = /^## Next\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return 'harness/progress.md has no "## Next" section: write the next step before stopping';
  if (!/^- \S/m.test(m[1] ?? '')) return 'harness/progress.md: "## Next" is empty: write the next step before stopping';
  return null;
}

/**
 * What a red run showed: 'assert' when a test ran and failed (vitest's
 * "Tests  N failed", Playwright's "N failed"); 'load' when only a test file
 * failed (a missing import is not a red that pins behaviour); 'none' otherwise.
 */
export function redKind(output) {
  if (/^\s*Tests\s+[1-9]\d* failed/m.test(output)) return 'assert';
  if (/^\s+[1-9]\d* failed\s*$/m.test(output) && !/^\s*Test Files/m.test(output)) return 'assert';
  if (/^\s*Test Files\s+[1-9]\d* failed/m.test(output)) return 'load';
  return 'none';
}
