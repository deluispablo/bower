// Run after each export of the landing from the design canvas (public/landing/).
// The browser parses SVG attributes before the canvas runtime fills its
// {{ placeholders }}, and logs an error for each; the runtime also reads
// `sc-camel-<attr>`, which the browser ignores. Copy that the canvas keeps
// but the app's copy rules do not allow is replaced too (COPY).
// The page logic is plain JS: emit the same function body at fix time instead
// of compiling a string in the browser. `--check` detects re-exports and drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { Script } from 'node:vm';

const file = new URL('../public/landing/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const SVG_ATTRS = /\s(d|fill|stroke|opacity|marker-end|points|transform|viewBox)="([^"]*\{\{[^"]*)"/g;
/** [what the canvas says, what the landing says]: plain words, no jargon where a first-time visitor reads. */
const COPY = [['using PARA unless your rules say otherwise', 'in folders by how soon you need things (Projects, Areas, Resources, Archive), unless your rules say otherwise']];
let fixed = html.replace(SVG_ATTRS, (_m, attr, value) => ` sc-camel-${attr}="${value}"`);
for (const [from, to] of COPY) fixed = fixed.split(from).join(to);
// The export has no main landmark: the content container is the one main (axe: region, landmark-one-main).
const MAIN = /<div class="pg"(?![^>]*\brole="main")/;
fixed = fixed.replace(MAIN, '<div class="pg" role="main"');
const main = Number(MAIN.test(html));
const n = (html.match(SVG_ATTRS) ?? []).length;
const words = COPY.filter(([from]) => html.includes(from)).length;
const supportFile = new URL('../public/landing/support.js', import.meta.url);
const support = readFileSync(supportFile, 'utf8');
const scripts = [...fixed.matchAll(/<script\b[^>]*\bdata-dc-script\b[^>]*>([\s\S]*?)<\/script\s*>/g)];
if (scripts.length !== 1) throw new Error('Expected exactly one landing page script.');
// The export's ze() applies no Babel/JSX transform (the separate x-import
// loader does). Keep its three arguments and its return expression verbatim.
const original = 'function ze(t){return new Function("DCLogic","StreamableLogic","React",t+`\n;return (typeof Component!=="undefined"&&Component)||undefined;`)(I,I,L())}';
const start = '/* landing-precompiled:start */';
const end = '/* landing-precompiled:end */';
const source = scripts[0][1];
const compiled = `${start}function ze(t){if(t!==${JSON.stringify(source)})throw new Error("Landing script changed; run scripts/fix-landing.mjs.");return(function(DCLogic,StreamableLogic,React){${source}\n;return (typeof Component!=="undefined"&&Component)||undefined;})(I,I,L())}${end}`;
let old = original;
if (support.includes(start)) {
  const last = support.indexOf(end, support.indexOf(start));
  if (last < 0) throw new Error('Incomplete precompiled landing script.');
  old = support.slice(support.indexOf(start), last + end.length);
}
if (support.split(old).length !== 2) throw new Error('Unknown landing page-script loader; review the export before fixing it.');
const fixedSupport = support.replace(old, () => compiled);
// Parse the emitted asset without executing it; invalid new exports fail here.
new Script(fixedSupport, { filename: 'landing/support.js' });
const logic = fixedSupport !== support;
if (process.argv.includes('--check')) {
  if (n || words || main || logic) {
    console.error(`${n} placeholder attribute(s) the browser would parse, ${words} copy fix(es), ${main} missing main landmark(s),${Number(logic)} page script(s) needing precompilation: run node scripts/fix-landing.mjs`);
    process.exit(1);
  }
  console.log('landing ok');
} else {
  writeFileSync(file, fixed);
  writeFileSync(supportFile, fixedSupport);
  console.log(`fixed ${n} attribute(s), ${words} copy line(s), and ${Number(logic)} page script(s)`);
}
