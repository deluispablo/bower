# B2a summary format: red evidence

implementer: codex

Role: red-owning session only; implementation and commits belong to the following sessions/coordinator.
worktree: /private/tmp/bower-b2a-summary-format
branch: b2a-summary-format
HEAD: 18b347a10126f9b4448f48c86a4ce7cdf6808ebf

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
