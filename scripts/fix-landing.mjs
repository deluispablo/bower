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
// Claims the code does not back are said as the code does them (no apostrophes: some sit in the page script's quoted strings).
const COPY = [
  ['using PARA unless your rules say otherwise', 'in folders by how soon you need things (Projects, Areas, Resources, Archive), unless your rules say otherwise'],
  // The runner reads only text and PDFs; pictures and other kinds are filed by name and words (runner/src/extract.ts).
  ['Tap once, and Bower reads each one, names it and files it in your own Google Drive.', 'Tap once, and Bower names each one and files it in your own Google Drive.'],
  ['Save things as they come, from any app. When you are ready, tap Tidy up: Bower reads each one, names it', 'Save things as they come, from your phone or computer. When you are ready, tap Tidy up: Bower reads what it can, names each one'],
  // No share target in the app manifest (vite.config.ts): things come in pasted, uploaded or from the camera (Add.tsx).
  ['Shared from the browser', 'A link you pasted'],
  ['Shared from Mail', 'Uploaded from your phone'],
  ['Shared from Files', 'Uploaded from your phone'],
  ['Photos, PDFs, links, Word, OpenDocument, HTML, EPUB and RTF documents, and anything you type or dictate.', 'Photos, PDFs, links and any other file, with a line of your own. Bower reads notes and PDFs; the rest it files by name and your words.'],
  // Web tools are always denied to Claude (runner/src/claude.ts NO_EFFECT_DENY); the setting changes no real tidy-up.
  ['it checks it against your notes, can look up on the web what the document leaves out, and writes down what follows.', 'it checks it against your notes and writes down what follows. Looking things up on the web is still to come.'],
  ['Looking things up on the web is an option you turn on in Settings, if whoever runs your Bower allows it.', 'Looking things up on the web, shown in some of them, is still to come.'],
  // The Worker keeps recent runs with names and open questions (api/src/person-schema.ts); the device keeps no notes.
  ['Bower keeps your sign-in and a pointer to the folder, never your notes.', 'Bower keeps your sign-in, a pointer to the folder and a short record of recent tidy-ups, never your notes.'],
  ['The app, and your notes cached so you can read them offline.', 'The app, and what you add until it reaches your Drive.'],
  ['Your sign-in, a pointer to your folder, and the pages of the app.', 'Your sign-in, a pointer to your folder, the app, and a record of recent tidy-ups: names and questions.'],
  ['A note, a file or a summary of one. Ever.', 'Your notes and files themselves.'],
  ['Nothing between tidy-ups. During one, a temporary copy of your folder.', 'Nothing between tidy-ups. During one, a temporary copy of your folder, read by Claude.'],
  // The one credential is CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token` (runner/workflows/tidy.yml, docs/runbook.md).
  ['a Claude subscription or API key', 'a Claude subscription'],
  ['0 € a month', '0 €, plus Claude'],
  // No people limit in the Worker: an allowlist of addresses (api/src/store.ts); Google gates others (docs/runbook.md).
  ['for themselves and up to 100 people they invite.', 'for themselves and the people they invite.'],
  ['Whoever sets up a Bower can invite up to 100 people.', 'Whoever sets up a Bower invites people by email; beyond their own accounts, Google must first approve the app.'],
  // No schedule anywhere: the health note is written by each tidy-up (runner/src/index.ts healthOf).
  ['The only thing that runs by itself is a weekly health check of the folder.', 'Each tidy-up also checks the health of the folder; nothing runs on a timer.'],
  ['the brand, the bird and the code', 'the brand, the bowerbird and the code'],
  ['one drawing with twelve poses', 'one drawing with nine poses'],
];
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
