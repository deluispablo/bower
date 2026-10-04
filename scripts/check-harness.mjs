// Keeps the harness honest (docs/harness/METHOD.md); the rules are in harness-rules.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { problems, readProofs } from './harness-rules.mjs';

const root = new URL('..', import.meta.url);
const features = JSON.parse(readFileSync(new URL('harness/features.json', root), 'utf8'));
const proofFile = new URL('harness/proof.log', root);
const bad = problems(features, readProofs(existsSync(proofFile) ? readFileSync(proofFile, 'utf8') : ''));
if (bad.length) {
  console.error(`The harness is not honest yet:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`harness ok: ${features.filter((f) => f.passes).length}/${features.length} entries pass, each with its proof`);
