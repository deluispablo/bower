// Run after each export of the landing from the design canvas (public/landing/).
// The browser parses SVG attributes before the canvas runtime fills its
// {{ placeholders }}, and logs an error for each; the runtime also reads
// `sc-camel-<attr>`, which the browser ignores. `--check` only says whether it is needed.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../public/landing/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const SVG_ATTRS = /\s(d|fill|stroke|opacity|marker-end|points|transform|viewBox)="([^"]*\{\{[^"]*)"/g;
const fixed = html.replace(SVG_ATTRS, (_m, attr, value) => ` sc-camel-${attr}="${value}"`);
const n = (html.match(SVG_ATTRS) ?? []).length;
if (process.argv.includes('--check')) {
  if (n) {
    console.error(`${n} placeholder attribute(s) the browser would parse: run node scripts/fix-landing.mjs`);
    process.exit(1);
  }
  console.log('landing ok');
} else {
  writeFileSync(file, fixed);
  console.log(`fixed ${n} attribute(s)`);
}
