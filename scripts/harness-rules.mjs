// The harness's rules, pure, so they are tested (src/harness.test.ts) and used by
// scripts/check-harness.mjs and harness/done.sh alike.
import { createHash } from 'node:crypto';

/** The hash a proof line keeps for a verify command. */
export const hashOf = (verify) => createHash('sha256').update(verify).digest('hex').slice(0, 16);

/** proof.log lines → Map(id → hash). */
export function readProofs(text) {
  const out = new Map();
  for (const line of text.split('\n').filter(Boolean)) {
    const [id, hash] = line.split('\t');
    out.set(id, hash);
  }
  return out;
}

/** Everything that makes the feature list dishonest, one sentence each. */
export function problems(features, proofs) {
  const bad = [];
  for (const f of features) {
    if (f.passes && proofs.get(f.id) !== hashOf(f.verify)) bad.push(`${f.id}: passes without a proof for its current verify (close it with harness/done.sh)`);
    if (typeof f.task !== 'string') continue;
    for (const p of f.verify.split('&&').map((x) => x.trim())) {
      if (/vitest run/.test(p) && !/ -t /.test(p)) bad.push(`${f.id}: "${p}" names no test (add -t "<test name>")`);
      if (/playwright test|e2e-both/.test(p) && !/ -g /.test(p) && !/-c e2e\/pwa/.test(p)) bad.push(`${f.id}: "${p}" names no test (add -g "<test name>")`);
    }
  }
  return bad;
}

/** Entries other than `id` whose `passes` changed since `before` (one entry per commit). */
export function othersFlipped(before, now, id) {
  const was = new Map(before.map((x) => [x.id, x.passes]));
  return now.filter((x) => x.id !== id && was.has(x.id) && was.get(x.id) !== x.passes).map((x) => x.id);
}
