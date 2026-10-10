# B2a summary format: red evidence

implementer: codex

Role: red-owning session only; implementation and commits belong to the following sessions/coordinator.
worktree: /private/tmp/bower-b2a-summary-format
branch: b2a-summary-format
HEAD: 18b347a10126f9b4448f48c86a4ce7cdf6808ebf

## Red repair

2026-10-10, red-owning Codex session, after the four Blocking findings in
`2026-10-10-codex-b2a-summary-format-adversarial.md`. This section is the current red evidence;
the earlier red/green runs below are historical. Only the test and these notes changed.

tests changed: src/data/vault/note-format.test.ts: replace the unsafe yes/no/on/off plain control with quoted-write rows; add plain legacy meaning/person-note byte preservation, all-case YAML 1.1/1.2 string rows, lone-surrogate refusals and generator, and literal quoted separator reads. Lead-ruled amendment removes only quoted legacy-meaning expectations; plain meanings and untouched person-note bytes stay pinned. No other assertion or bound is loosened.

1. Legacy compatibility (lead ruling after 1a432aa2): plain values parse exactly as
   before; quoted values decode per YAML. Plain literal Unicode escapes and doubled
   apostrophes remain exact parse controls. The contradictory quoted legacy-meaning
   assertions are removed by the ruling, while the existing YAML decoding rows stay.
   Two untouched parse→serialize reds preserve a person's note bytes for stored
   `"a\u0041b"` and `'Alex''s note.'`, while asserting their decoded summaries are `aAb`
   and `Alex's note.`. These fixtures have no `by: bower` and assert `byBower: false`.
   The packet names only the serializer boundary and excludes existing-note edits,
   so byte preservation is pinned as a serializer property. Its existing layout avoids
   unrelated blank-line normalization; plain and quoted-colon byte controls pass first.
2. YAML compatibility: 28 exhaustive casing variants of yes/no/on/off/y/n, including mixed
   case, plus `0b11`, `1_000`, `12:30`, `0o17`, require exact double-quoted scalar spelling.
   Every row keeps the safe plain-summary control and exact parse-back comparison.
   The old line-54 control incorrectly required yes/no/on/off plain because YAML 1.2 core
   preserves them; YAML 1.1 readers resolve those spellings as booleans. Those four values
   move to quoting rows. Safe text, including `time 12:30`, remains required plain.
3. UTF-16: explicit U+D800/U+DBFF/U+DC00/U+DFFF refusal rows and 500 generated lone-surrogate
   examples (seed 422004, entire surrogate range) pin rejection independently of UTF-8
   replacement. Each generated example has a well-formed emoji substitute as an acceptance
   and exact round-trip control. The original 500-string round-trip generator is unchanged.
4. One line: retain existing NEL/U+2028/U+2029 refusal rows. Add six literal stored-value
   read cases (each separator in double and single quotes), expecting exact inner text
   without quotes and rejection for new authoring. Ordinary quoted text and valid one-line
   text are controls. NEL reads already pass; both quote styles for U+2028/U+2029 fail.

### Collision ruled

The lead ruled the recorded collision after 1a432aa2: quoted values decode per YAML;
the legacy promise is narrowed to "plain values parse exactly as before". A person's
note bytes must never be rewritten. The amended reds separate decoded display meaning
from untouched serializer byte preservation, without inventing a provenance mechanism.
The other three repairs and their bounds are unchanged.

### Offline standards check

Research used the installed YAML 2.9.1 README, YAML 1.1 boolean/integer/float schema sources
and quoted-scalar resolver. No network or dependency change. The reference remains
[YAML 1.2.2 flow scalars](https://yaml.org/spec/1.2.2/#73-flow-scalar-styles), with
[YAML 1.1 boolean](https://yaml.org/type/bool.html) and
[integer](https://yaml.org/type/int.html) resolution for the compatibility cases.
Case-exhaustive quoting is conservative: some mixed-case forms already parse as strings.
`0o17` is quoted for YAML 1.2 even though YAML 1.1 preserves it plain.
An offline oracle verifies all 32 expected quoted scalars as exact strings in both schemas
(64 checks), two safe plain controls per schema, and all six literal quoted separators under
YAML 1.2. Evidence: `tmp-logs/b2a-red-repair-yaml-oracle.json`; oracle exit 0.
Tests pin exact quoted bytes without importing an undeclared transitive YAML dependency.

### Repair verification

- `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-red-ruling.json > tmp-logs/b2a-red-ruling.log 2>&1`: exit 1; 244 tests, 42 assertion reds, 202 passes.
- Failure groups: 31 unsafe scalar writes, two untouched person-note byte cases, five
  surrogate refusals (including the generator), four literal U+2028/U+2029 quoted reads.
  No unexpected failure. The two amended plain-meaning controls pass, as do quoted YAML
  decoding and all byte-row controls before their final byte assertion.
- The serializer changes stored `"a\u0041b"` to plain `aAb`, and stored `'Alex''s note.'`
  to `"Alex's note."`. Both reads decode correctly; both untouched byte assertions fail
  at test line 145. The other failures retain their stated reasons: unsafe values remain
  plain, lone surrogates are accepted, literal U+2028/U+2029 values retain their quotes.
- Exact names, assertion locations and failure groups: `tmp-logs/b2a-red-ruling-audit.json`;
  full result: `tmp-logs/b2a-red-ruling.json`.
- Only the requested test file ran, once, with `--maxWorkers=2`. The initial redirected
  command could not start because tmp-logs/ was absent; the directory was created before
  the successful test invocation. Only failures and totals were read. No network,
  pnpm check, e2e, git write, commit or edit to `src/data/contracts/note-format.ts`.
- Prior repair evidence (244 tests, 44 reds, 200 passes; type/lint passes) is historical
  and superseded for the amended legacy contract by this run.

## Scope and rulings

Read WORKER.md, the B2a packet, TL-P4-42 Q1/Q2, and prep S1/S3/B2a. Swept DECISIONS.md for B2a and TL-P4-42 addenda: the base ruling at line 452 is present; no TL-P4-42 addendum is present. The packet narrows the prep's proposed allocation to the scalar contract and its existing test file. No runner test, caller, route, model reply, existing-note edit, or corpus fixture is changed.

- Point 1: each listed quoting condition has its own named red and a plain-summary positive control. Exact expected scalar spelling is independent of parseNote; tests also read the written note through parseNote. All listed leading indicators, quotes/backslashes, whitespace, typed-looking values and a date are covered. Packet-mandated quoting is conservative for cases YAML could otherwise accept (for example `-Alex` and a date under a core schema).
- Point 2: each double-quoted YAML escape and doubled single quote has a decoding red, with plain and ordinary quoted positive controls. Read compatibility covers the original test fixture shapes, LF/CRLF, missing summary, malformed quotes/unknown escapes and the existing reader's plain numeric/comment-like values. Decoded UTF-8 bytes are compared. No old fixture is edited.
- Point 3: fast-check is already a declared dependency. A deterministic sample of 500 generated one-line strings (seed 422003), plus explicit 200-unit/Unicode/punctuation/space examples, exercises serializeNote then parseNote. No independent test-only summary parser is introduced. The HEAD counterexample is a generated nonbreaking space, lost by trimming. Empty and whitespace-only strings belong to the round-trip contract even though validSummary refuses them for new authoring.
- Point 4 / Q1: validSummary is reached through a namespace helper; the absent export is an expect failure, never an import/load/type error. Accept/refuse rows pin nonempty trimmed content, one-line text, C0/DEL/C1 controls, line separators and the existing companion's raw JavaScript string-length bound of 200. Emoji boundary rows preserve that existing bound, rather than invent a code-point or byte limit. Every row runs a working parse/serialize control before checking the new export, then a validSummary acceptance control when the export exists. No caller is added.
- Point 5 / Q2 / S3: a passing scope control pins missing personal metadata, existing personal summaries, mechanism heading formats, the generated Rules count and Rules' custom-summary exception. It does not promise production authoring/edit behavior outside this entry. Backfill, state/Timeline updates and immutable sources stay with B2b/B2c and their existing mechanisms.

Unchanged compatibility and scope promises cannot honestly fail at HEAD. They are explicitly recorded below as passing controls, separate from the 152 new assertion reds. No artificial failure was added to these guards.

tests changed: src/data/vault/note-format.test.ts: imports, helpers and new tests added; no existing test changed.
removed: none
existing contradictory tests: none found in the touched file or the static summary-expectation sweep.
new corpus cases: none; no method verdict row is required or added.

## Research

Standard reference: [YAML 1.2.2 flow scalars, sections 7.3.1–7.3.3](https://yaml.org/spec/1.2.2/#73-flow-scalar-styles), with [section 5.7 escape sequences](https://yaml.org/spec/1.2.2/#57-escaped-characters). Double quotes decode YAML escapes; single quotes use doubled apostrophes; plain scalars have indicator/comment/colon restrictions and schema-sensitive types.

Offline research used the installed YAML 2.9.1 README and stringifyString implementation inside this worktree. Its standard approach checks plain-scalar restrictions and resolved types and uses escaped quoted text when required. A one-off local YAML oracle parsed every expected quoting/decoding scalar: 45 + 22 exact text matches, recorded in tmp-logs/b2a-yaml-oracle.json. The oracle uses the existing installed package only; it adds no dependency or test-only production mechanism. No network request was made. The specification links identify the standard; they were not fetched in this session.

## Compatibility rows

| Contract home | Required write behavior | Existing read behavior pinned | Evidence |
| --- | --- | --- | --- |
| src/data/contracts/note-format.ts: summary serialization | Safe one-line plain or YAML double-quoted text, preserving spaces | Existing ordinary/demo summaries unchanged | Point 1 rows, point 3 and legacy fixture control |
| src/data/contracts/note-format.ts: summary parsing | No change to other frontmatter or note ownership | Decode quoted text; retain old plain summaries, malformed quote/unknown-escape reads | Point 2 rows and legacy fixture control |
| src/data/contracts/note-format.ts: validSummary | One line, nonempty after trimming, no controls, at most 200 raw string units | Stored reads remain lenient; no new caller or backfill | Point 4 rows and point 5 control |

These are the compatibility obligations for the ensuing contract fix, not a claim that implementation has landed.

## Verification

Only the targeted test file was run, with --maxWorkers=2. Final run: 197 tests, 152 expected failures, 45 passes (42 existing tests + 3 new controls). Every new red fails on AssertionError at the stated assertion; all suite imports load. Point counts: 45 serialization, 22 decoding, 1 generated round trip, 84 validator rows. Positive parse/serialize controls precede each new red and are not the failing assertion.

Commands and logs:

- `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-reds.json > tmp-logs/b2a-reds.log 2>&1`: exit 1, intentional reds.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b2a-tsc-app.log 2>&1`: exit 0.
- `pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/b2a-tsc-node.log 2>&1`: exit 0.
- `pnpm exec eslint src/data/vault/note-format.test.ts > tmp-logs/b2a-eslint.log 2>&1`: exit 0.
- Machine audit: tmp-logs/b2a-red-audit.json; full per-test assertion evidence: tmp-logs/b2a-reds.json.

Only failure details were printed from test output; passing cases were checked by status/count. No real timers, Drive access, git writes, pnpm check, e2e, commit or application fix was run. Full gates are excluded by this red session's explicit targeted-only instruction.

## Reds

Each row below names the exact test, its file and its observed HEAD failure. Each runs the plain-summary parse/serialize positive control first. Validator rows fail on export availability at HEAD; their accept/refuse assertions become reachable when the new export is implemented.

- `B2a summary: 1 colon-space: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 space-hash: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading spaces: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 trailing spaces: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 double quote: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 single quote: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 backslash: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator -: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator ?: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator :: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator ,: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator [: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator ]: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator {: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator }: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator #: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator &: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator *: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator !: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator |: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator >: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator ': writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator ": writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator %: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 leading indicator @: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- ``B2a summary: 1 leading indicator `: writes one escaped double-quoted scalar`` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking true: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking false: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking True: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking FALSE: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking null: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking Null: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking NULL: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking ~: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking 123: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking -123: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking +123: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking 1.5: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking 1e3: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking 0x1f: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking 0o17: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking .inf: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking -.inf: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking .NaN: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 1 typed-looking 2026-10-10: writes one escaped double-quoted scalar` — `src/data/vault/note-format.test.ts` — Expected exact escaped double-quoted summary line; HEAD writes plain/trimmed text.
- `B2a summary: 2 escaped double quote: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 escaped backslash: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 doubled single quote: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 multiple doubled single quotes: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape 0: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape a: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape b: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape t: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape n: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape v: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape f: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape r: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape e: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape  : decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape /: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape N: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape _: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape L: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape P: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape x41: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape u03A9: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 2 YAML escape U0001F642: decodes quoted text exactly` — `src/data/vault/note-format.test.ts` — Expected decoded summary UTF-8 bytes; HEAD retains escape/doubled-apostrophe bytes.
- `B2a summary: 3 generated one-line strings: round-trips exact text within 200 characters` — `src/data/vault/note-format.test.ts` — Expected generated U+00A0 summary preserved; HEAD trims it to empty.
- `B2a summary: 4 ordinary text: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 Unicode and emoji: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 YAML punctuation: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 edge spaces: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 200-character bound: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 bound counts untrimmed text: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 Unicode at existing string bound: validSummary accepts valid one-line text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 empty: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 only spaces: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 only nonbreaking spaces: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 201-character bound: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 over bound before trimming: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 Unicode over existing string bound: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 LF never folded: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 CR never folded: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 CRLF never folded: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 NEL never folded: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 line separator never folded: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 paragraph separator never folded: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0000: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0001: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0002: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0003: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0004: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0005: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0006: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0007: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0008: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0009: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+000a: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+000b: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+000c: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+000d: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+000e: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+000f: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0010: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0011: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0012: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0013: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0014: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0015: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0016: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0017: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0018: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0019: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+001a: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+001b: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+001c: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+001d: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+001e: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+001f: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+007f: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0080: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0081: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0082: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0083: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0084: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0085: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0086: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0087: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0088: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0089: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+008a: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+008b: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+008c: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+008d: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+008e: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+008f: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0090: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0091: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0092: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0093: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0094: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0095: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0096: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0097: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0098: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+0099: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+009a: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+009b: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+009c: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+009d: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+009e: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.
- `B2a summary: 4 control U+009f: validSummary refuses invalid text` — `src/data/vault/note-format.test.ts` — Expected validSummary export to be a function; HEAD returns undefined.

## Passing compatibility controls

These existing behaviors already hold at HEAD and remain required after the fix.

- `B2a summary: 1 plain controls: keeps safe YAML text plain and unchanged` — `src/data/vault/note-format.test.ts` — pass at HEAD.
- `B2a summary: 2 legacy fixtures: keeps old parsed summary bytes and personal text` — `src/data/vault/note-format.test.ts` — pass at HEAD.
- `B2a summary: 5 Q2 scope controls: preserves absent personal metadata and Rules count summary` — `src/data/vault/note-format.test.ts` — pass at HEAD.

## Left out

The fix, callers, authoring, fallback summaries, state edits, live/corpus integration, commits and full gates belong to later sessions. No contract number or existing test was weakened.

## Implementation

Implementation session: codex; all git writes and commits are left to the coordinator. The existing `frontOf` and `serializeNote` mechanisms now encode/decode summary scalars in their contract home. Only `src/data/contracts/note-format.ts` is changed in production. No new dependency, caller, route, storage write, fixture or corpus change is introduced. This pure format change performs no content write; the existing callers' modifiedTime handling is untouched.

The initial implementation-session run reproduced all 152 assertion reds, with 45 passing controls/existing tests. After the fix, all 197 tests in the red file passed, including every exact `B2a summary:` name listed above. The generated round trip retains edge spaces and Unicode; ordinary safe summaries stay plain. The validator preserves the 200 untrimmed JavaScript string-unit bound and refuses empty trimmed text, C0/DEL/C1 controls and line separators. It has no new callers. Serialization preserves text in one physical line using escapes rather than folding; the reader stays lenient for unknown escapes and incomplete quoted values.

The supplied notes contain no `Red repair` section. The existing `Reds` section and fixed tests were read unchanged; no red contradicts the packet or Q1/Q2.

tests changed: none
removed: summary-only trimming and newline folding through oneLine.
removed: summary-only quote stripping without YAML escape decoding.
removed: no dependency, caller, test, fixture, corpus file or other format mechanism.

### Standards researched before implementation

Research was entirely offline, reading the installed YAML 2.9.1 README, `dist/stringify/stringifyString.js`, `dist/compose/resolve-flow-scalar.js`, core-schema boolean/null/integer/float definitions and the timestamp definition, all inside this worktree. The installed package is research evidence only and is not imported by production. A read-only scalar check through that package confirmed the double-quote fixture spelling matches the intended text. The following links identify the standards; none was fetched over the network.

- Plain-scalar eligibility and preservation of whitespace/indicators/comments/colons: [YAML 1.2.2 §7.3.3](https://yaml.org/spec/1.2.2/#733-plain-style). The packet additionally requires conservative quoting of every listed leading indicator and embedded quote/backslash.
- Double-quoted write and read, including JSON-compatible escapes and YAML named/hexadecimal escapes: [YAML 1.2.2 §7.3.1](https://yaml.org/spec/1.2.2/#731-double-quoted-style) and [§5.7](https://yaml.org/spec/1.2.2/#57-escaped-characters). JSON.stringify supplies the shared escape subset; YAML-sensitive controls, separators, BOM and noncharacters are explicitly escaped too.
- Single-quoted summary decoding with doubled apostrophes: [YAML 1.2.2 §7.3.2](https://yaml.org/spec/1.2.2/#732-single-quoted-style).
- Quoting boolean/null/numeric-looking values: [YAML 1.2.2 §10.3.2](https://yaml.org/spec/1.2.2/#1032-tag-resolution), confirmed against the installed core schema. Conservative date/timestamp quoting follows the packet and [YAML timestamp type](https://yaml.org/type/timestamp.html), confirmed against the installed timestamp schema; yes/no/on/off remain strings under the core schema.
- Control/line-break validation: [YAML 1.2.2 §5.1](https://yaml.org/spec/1.2.2/#51-character-set) and [§5.4](https://yaml.org/spec/1.2.2/#54-line-break-characters) supply the format background; TL-P4-42 Q1 and the fixed validator rows supply the stricter authoring contract. The 200-unit bound uses [ECMAScript String values](https://tc39.es/ecma262/#sec-ecmascript-language-types-string-type), preserving the existing string-length semantics.

### Draft compatibility rows for coordinator commits

One production-contract commit is proposed. The coordinator fills its SHA and commits these notes separately.

| Commit (coordinator fills SHA) | Contract home | New write/export behavior | Compatible reads | Evidence |
| --- | --- | --- | --- | --- |
| Pending: B2a format fix | src/data/contracts/note-format.ts | Exact one-line plain/escaped double-quoted summary; validSummary export enforces Q1 without callers | Existing plain summaries, missing metadata, malformed quote/unknown escape values and other frontmatter unchanged; standard quoted summaries decoded | Every fixed B2a red and legacy/Q2 controls; implementation verification below |

### Implementation verification

Logs are under `tmp-logs/`; only failing assertions/diagnostics and machine-readable totals are read. No pnpm check or e2e is run, per the implementation assignment.

- Red: `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-implementation-red.json > tmp-logs/b2a-implementation-red.log 2>&1`: exit 1, 197 tests, 152 assertion failures, 45 passes.
- Green: `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-implementation-green.json > tmp-logs/b2a-implementation-green.log 2>&1`: exit 0, 197 tests passed.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b2a-implementation-tsc-app.log 2>&1`: exit 0.
- `pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/b2a-implementation-tsc-node.log 2>&1`: exit 0.
- `pnpm exec eslint src/data/contracts/note-format.ts > tmp-logs/b2a-implementation-eslint.log 2>&1`: final exit 0 after removing one unnecessary regular-expression escape.
- `pnpm exec vitest run src/data --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-implementation-data.json > tmp-logs/b2a-implementation-data.log 2>&1`: exit 0, all 4,085 tests passed. JSON reports 330 total test-suite units.
- The red-file green command was repeated after the equivalent ESLint escape cleanup: final exit 0, all 197 tests passed. The broad src/data run also passed. No test, fixture or corpus file changed.
- `git diff --check`: exit 0; read-only git status/diff confirm only the formatter and these notes changed. No git write was run.

Left out: summary callers/authoring/fallbacks and existing-note edits remain with B2b/B2c; commits, SHA completion and integration gates remain with the coordinator. No incompatible red or ruling was found.


## Fix round 1

2026-10-10, fresh Codex implementation session at committed red repair `2c01218e`.
Read the packet, adversarial review and current Red repair ruling. The existing dirty
notes were preserved; this section is appended. Only `src/data/contracts/note-format.ts`
changed in production. No network, git write, test edit, dependency change or new caller.
The assignment overrides the packet's general gates: only the red file, src/data suite,
app/node TypeScript and formatter ESLint ran. Commits and integration gates remain with
the coordinator. The initial red redirect could not start before tmp-logs/ existed;
the directory was created and the red then ran successfully.

tests changed: none
removed: core-schema-only summary type patterns that left YAML 1.1 booleans and numbers plain.
removed: quoted-summary boundary matching that excluded literal U+2028 and U+2029.
removed: acceptance of lone UTF-16 surrogates by validSummary.
removed: normalized serialization of an untouched parsed personal note in place of its source bytes.
removed: no test, fixture, caller, dependency or other format mechanism.

The existing scalar writer conservatively quotes every casing of yes/no/on/off/y/n,
binary integers, underscore numbers and sexagesimal numbers, alongside its YAML 1.2
cases. The plain reader is unchanged. The quoted-summary boundary uses dotAll so literal
NEL, line and paragraph separators read as inner text; quoted YAML escapes and doubled
apostrophes retain their standard decoding. validSummary rejects Unicode surrogate code
points with the Unicode Cs category (paired emoji remain accepted) and retains its Cc,
U+2028/U+2029 and 200 untrimmed UTF-16-unit checks. Direct serialization also quotes lone
surrogates, letting JSON escaping avoid UTF-8 replacement without accepting them for
authoring.

For an untouched personal note, parseNote retains the original raw string and the
existing serializer's baseline in a WeakMap keyed by the returned note. serializeNote
returns that source string when its generated representation still equals the baseline.
This preserves all original bytes while the display summary decodes per YAML, without
adding fields to the note model. The baseline uses the existing serializer, not a second
format writer. Changed fields use the existing serialization path; source retention is
for the same parsed object and is not propagated by cloning/spreading. Existing-note
editing remains outside this packet; this source retention performs no storage write.

### Offline standards used

Before editing, read the installed YAML 2.9.1 YAML 1.1 boolean, integer and float schema
sources, timestamp intTime/floatTime patterns, and quoted flow-scalar resolver. Their
implicit resolution patterns support the quote eligibility changes. No package is added
or imported. Standards links identify the references and were not fetched:
[YAML 1.2.2 flow scalars](https://yaml.org/spec/1.2.2/#73-flow-scalar-styles),
[YAML 1.1 boolean](https://yaml.org/type/bool.html),
[integer](https://yaml.org/type/int.html) and [float](https://yaml.org/type/float.html).

### Compatibility row draft

| Commit (coordinator fills SHA) | Contract home | Write/export behavior | Existing reads and bytes | Evidence |
| --- | --- | --- | --- | --- |
| Pending: B2a fix round 1 | src/data/contracts/note-format.ts | Quote YAML 1.1/1.2 unsafe strings; refuse lone surrogates and Cc/U+2028/U+2029 for authoring | Plain summary meanings unchanged; quoted summaries decode per YAML including literal separators; untouched parsed personal notes retain their source bytes | All 244 red-file tests and 4,132 data tests pass |

### Verification

Output is under tmp-logs/. Only failed assertions/diagnostics and machine-readable counts
were read. Exact B2a test names remain in the unchanged red file and JSON results.

- Red: `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-fix1-red.json > tmp-logs/b2a-fix1-red.log 2>&1`: exit 1; 244 tests, 42 assertion failures, 202 passes. Failures: 31 unsafe writes, two personal-byte rows, four quoted separator reads, five surrogate refusals including the generator. No unexpected failure.
- Green: `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-fix1-green.json > tmp-logs/b2a-fix1-green.log 2>&1`: exit 0; 244 passed, including every `B2a summary:` red and all controls.
- Data: `pnpm exec vitest run src/data --maxWorkers=2 --reporter=json --outputFile=tmp-logs/b2a-fix1-data.json > tmp-logs/b2a-fix1-data.log 2>&1`: exit 0; all 4,132 tests passed.
- App: `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b2a-fix1-tsc-app.log 2>&1`: exit 0.
- Node: `pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/b2a-fix1-tsc-node.log 2>&1`: exit 0.
- Lint: `pnpm exec eslint src/data/contracts/note-format.ts > tmp-logs/b2a-fix1-eslint.log 2>&1`: exit 0.
- Read-only `git diff --check`: exit 0 before this notes append. Source diff: 22 added and 11 removed lines; the red test has no diff. No git write or commit ran.

Left out: B2b/B2c callers, authoring, fallback and editing; commits, SHA completion,
pnpm check, e2e and integration remain with the coordinator under this assignment.
