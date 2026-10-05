// Run after each export of the landing from the design canvas (public/landing/).
// The browser parses SVG attributes before the canvas runtime fills its
// {{ placeholders }}, and logs an error for each; the runtime also reads
// `sc-camel-<attr>`, which the browser ignores. Copy that the canvas keeps
// but the app's copy rules do not allow is replaced too (COPY).
// `--check` only says whether it is needed.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../public/landing/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const SVG_ATTRS = /\s(d|fill|stroke|opacity|marker-end|points|transform|viewBox)="([^"]*\{\{[^"]*)"/g;
/** [what the canvas says, what the landing says]: plain words, no jargon where a first-time visitor reads. */
const COPY = [['using PARA unless your rules say otherwise', 'in folders by how soon you need things (Projects, Areas, Resources, Archive), unless your rules say otherwise']];
let fixed = html.replace(SVG_ATTRS, (_m, attr, value) => ` sc-camel-${attr}="${value}"`);
for (const [from, to] of COPY) fixed = fixed.split(from).join(to);
const n = (html.match(SVG_ATTRS) ?? []).length;
const words = COPY.filter(([from]) => html.includes(from)).length;
if (process.argv.includes('--check')) {
  if (n || words) {
    console.error(`${n} placeholder attribute(s) the browser would parse, ${words} copy fix(es) to make: run node scripts/fix-landing.mjs`);
    process.exit(1);
  }
  console.log('landing ok');
} else {
  writeFileSync(file, fixed);
  console.log(`fixed ${n} attribute(s) and ${words} copy line(s)`);
}
