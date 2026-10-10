# P4-E preparation: rules-original-conversion

Status: draft for the technical lead; no implementation or UI approval implied.
Checkout: `p4-rules-conv-prep`, baseline `5b16b6fa` from `claude/p3`, 2026-10-10.
Assignment: `docs/P4_PLAN.md:62`. This delivery changes this document only; test evidence is under `tmp-logs/`.

## Research and authority

Research was offline, using only files in this worktree. No original checkout, real folder content, network,
live model, or account was accessed. All proposed examples are made up. The reuse map is evidence about the
original app, not a substitute for having read its source: its full legacy grammar is not established here.

The established approach is an explicit, lossless format adoption: keep the original bytes, add a bounded
managed region, and use the existing version fence and write-once path. Do not parse and reserialize the
person's entire Markdown document, infer individual rules from arbitrary prose, or introduce a migration ledger.

Sources consulted before choosing the proposal:

- [Original-app reuse map](2026-10-06-old-app-reuse-map.md), line 14: original `app/src/rules.ts:386–455`
  uses idempotent append; `vault-store.tsx:882–938` reads fresh and checks modifiedTime. Reuse the pattern;
  the map explicitly says the new format differs. Line 15 records that the original has no Undo.
- `src/data/contracts/ownership-format.ts:15`: existing raw-byte boundaries and CommonMark ATX headings.
  [CommonMark headings](https://spec.commonmark.org/0.31.2/#atx-headings) is the standard referenced by that
  local implementation, not a newly fetched source. Use this boundary machinery, not a general Markdown rewrite.
- `src/data/drive/drive-http.ts:248`: existing read-before-write version check and multipart metadata/media
  update, citing [Drive multipart uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#multipart).
  The URL was not fetched. The local code documents the short window between check and write; this proposal
  does not claim a server-side conditional write or atomic exclusion of outside editors.
- `src/data/spine/write-once.ts:140`, `:156`: an update is resolved by file id, stamp, expected result and
  checksum, including a lost response. Reuse it through `DriveVault.once`, not a new retry routine.
- [Architecture mechanism map](../ARCHITECTURE.md), lines 89–99: still-as-seen, write-once, journal Undo,
  the run engine, and ownership each have one home. `note-edit.ts:943` is the run edit author.

Rulings read: `DECISIONS.md:78–79` (TL-P3-27 and addendum), `:100` (TL-P4-07 addendum 3), `:327`
(TL-P4-27 addendum 8), `:388–393` (TL-P4-37 addendum 1), `:432–440` (TL-P4-40), and `:461`
(TL-P4-45). The requested TL-P4-37 context is historical: TL-P4-38 supersedes that scope, and TL-P4-45
places index/hot/log in `.bower/`. Rules remains visible at the root. `AGENTS.md` hard rules apply:
no automatic rewrite of personal text, no hard deletion, modifiedTime on every content write, no app writes
to runner-owned `.bower/` files or Bower's note sections. Conversion needs an explicit lead ruling granting
the app this format-adoption write; it does not grant the app ordinary rule wording.

## 1. Promise, in checkable parts

### What happens today

1. Opening the app does not convert an original plain file. `DriveVault.rules()` reads its text with
   `parseRules`, then overlays rule journal lines. Without an exact `## Rules` heading, the stored list is
   empty. With that heading, only `- ` bullets in its first section are returned; arbitrary prose,
   `* ` bullets and later sections are not returned as rule cards. This is a display/parser limitation,
   not evidence that the model ignores that text.
2. `addRule` records a pending rule in the journal; it does not write Rules. A normal tidy-up cannot word
   that pending rule into an unowned plain original file: `wordRules` refuses `not-bower`. The journal
   addition remains pending. A legacy front-matter file already saying `by: bower` behaves differently;
   eligibility must inspect actual bytes, not simply the filename or an absent Drive stamp.
3. The runner reads the root Rules file as raw text for the model, without an ownership prerequisite or
   `parseRules`. It shows the first 4,000 JavaScript string units, followed by a marked cut when needed.
   Whole visible lines may be cited as placement basis; a partial line or cut marker cannot be cited.
4. Runner template repair is a separate existing exception: only exact `OLD_RULES_TEMPLATE` bytes are
   replaced, or exact new template bytes receive their missing mark. An original with personal rules is
   left alone. Keep those equality checks and tests; never broaden repair into original-file conversion.

### Recommended meaning of Bower-managed (decision Q1 required)

Management means Bower can word **new journal rules in its own region**. It does not mean that every old
sentence becomes an individually removable app rule. The person's original document remains effective
rules for the model and is kept as one immutable source region. Existing legacy managed documents keep
their current grammar and behaviour. The app must show the preserved source separately from managed
rule cards; its exact presentation needs the designer and owner.

Proposed converted layout, to be ratified rather than implemented by this prep:

```text
generated front matter (by: bower, kind: Rules, bower_rules_original: 1)
generated summary describing both sources, not a count of only the new rules

## Rules

<only Bower-worded additions, initially empty>
## Your original rules

<the complete original byte sequence, including any BOM and final-newline choice>
```

The proposed internal version key is not a displayed note property: extend the existing note parser's
internal-key exclusion, not the UI, to keep it out of property rows. Its name/value require Q2's ruling.
The conversion version and separator belong to the generated prefix; the original starts immediately
after that fixed separator. Derive the managed block from `serializeRules`, rather than a second template.
The exact visible heading and summary are designer questions D1–D2, not approved copy. The format helper
must identify this shape from its generated front matter and prefix, not from a heading found anywhere
in arbitrary personal text. No metadata inside the original is interpreted as conversion authority.

- **Bower's:** generated front matter/summary, conversion boundary, first `## Rules` section and its
  managed rule entries. Ordinary changes to that section remain runner-authored through rules-wording.
- **The person's:** every byte of the appended original, including old headings, bullets, comments,
  whitespace and prose. No date or "You wrote" lines are inserted into that source. It is not passed
  through `serializeRules`, `serializeNote`, line-ending normalization, or a model for conversion.
- **Proof:** extract the original span as bytes before and after conversion, managed additions, removals
  and Undo. Its length, bytes and SHA-256 must equal the input. Keep the same Drive id, root parent and name.
  Prefix generation must not strip an original BOM; use the existing fatal UTF-8 handling that preserves it.
- **Boundary:** rule parsing/wording uses only the managed section, so an original `## Rules` or
  `## Current state` cannot accidentally become Bower's editable section. The shared edit author must
  protect the original span for every automatic edit, not merely for the first conversion. A file-wide
  `by: bower` flag by itself is insufficient to make this promise.

Q1 is material: if the lead intends every imported rule to support individual Remove/Undo, this proposal
does not meet that wider promise. Keeping the original active while deleting only a normalized copy would
silently keep the rule in force. That requires a new ruling about source authority and deactivation, not
heuristic extraction or a hidden rewrite in this entry.

### Action and write

One explicit person action on the existing rules surface authorizes management. Merely opening, signing
in, reconnecting, adding a rule, accepting a suggestion, or running a tidy-up does not authorize conversion.
Designer/owner must approve the action, explanation and outcomes under TL-P4-40 before the UI packet.
Do not add an onboarding wizard or a UI branch for each Markdown shape.

Proposed vault entry points: a typed document-state read and `convertRules(fileId, seenModifiedTime)`,
returning an Undo closure. Names/signatures are draft Q4, not existing APIs. Read fresh by the shown id;
check root/name/place and modifiedTime; read bytes; author a prefix plus the untouched original; verify the
byte invariant; send one content update through `DriveVault.once` with the read modifiedTime and its fence.
On stale state, reject with the existing conflict/refresh path; no merge with the person's edited text.
Do not adopt a different file selected by name after the action. Resolve ambiguous root matches by an
honest refusal/reload, not a new picker. Missing files continue to use the existing new-template path.

Recommendation Q3: persist the scope/version in the generated front matter, leaving existing appProperties
unchanged except the normal write stamp. Rule wording already authorizes from the text, not `PROP.by`.
This avoids a content-then-mark transaction and a separate property-clearing operation during Undo.
If the lead requires template-style `PROP.by`, both adoption and restoration need a ruled metadata contract;
the present `writeText` property type cannot clear a property in the same media update.

No backup file, move, Bin or deletion is necessary: the original is retained in the same file. No new
`.bower/` file is written. Refuse invalid UTF-8 or a result above the existing 1 MiB edit bound without
changing anything; this is an honest supported limit, not an alternate migration route.

### Undo

- **Conversion Undo:** reverse only that explicit adoption, restoring the original bytes on the same id,
  using the conversion's observed result version, the same fence and write-once mechanism. If the file
  has subsequently changed, refuse and refresh; never overwrite later managed rules or personal edits.
  Existing/pending journal rules are not deleted or retracted by this Undo; they remain pending if the
  document becomes plain again. A reload may end the closure's availability, as with existing action Undo.
  The exact promise and its conflict outcome require D3 approval. No new journal kind is proposed.
- **Managed rule Undo:** keep the journal's inverse-forward-change design. Use `removeRule`, its Undo
  closure and `dismissSuggestion(..., true)`'s Undo. The rule text is resolved through `ruleSequence`/
  `wordRules`, including wording with a full stop and equal-time line ordering. Never edit sent journal
  files or implement a second cancellation system.
- **Original source rules:** no individual Remove button is promised by this recommended scope. The
  person's source is still theirs to edit outside the app. Original-source revision history is not added.

### The model's view

Recommendation Q7: for plain and existing managed files, leave today's model input byte-for-byte unchanged.
For the converted shape only, project **original text first**, followed, when nonempty, by the managed
`## Rules` section. Omit generated conversion metadata, summary and empty headings. Empty conversion
then gives exactly the original model rules string; prefix overhead cannot displace an old rule from the
4,000-unit window. Use one projection in the rules-format home, then today's `bounded` and rules-specific
cut marker. Do not introduce a second budget, prompt slot, ordering mechanism or brain contract.

When managed additions exist, this is a changed model view: the original stays first; additions share the
same bound and can be cut. No promise that all rules are visible. The omitted count refers to the projected
rules text, and the marker still says the rules may continue. The existing whole-line basis guard must read
this same projected, bounded value. Never use an unseen rule, metadata, or a generated heading as authority.
If a generated heading can pass the current generic whole-line guard, tighten that guard in its one home.
Fingerprint/section hashes must describe the actual projected input. Corpus proposals below are conditional
on this model-view ruling; they are not new corpus files in this delivery.

## 2. Existing mechanisms, gaps and proposed entry split

### Evidence at this checkout

| Behaviour | Evidence |
| --- | --- |
| Shared parser/serializer; legacy template constants | `src/data/contracts/rules-format.ts:16`, `:36`, `:50`, `:60`; vault module is a re-export |
| Parser stops at the first subsequent heading; no arbitrary-prose extraction | `src/data/contracts/rules-format.ts:18–31`; `src/data/vault/rules-format.test.ts:33`, `:36` |
| App reads stored rules and journal; add is journal-only | `src/data/vault/drive-vault.ts:1325`, `:1341`; `src/data/sources.ts:89`, `:98` |
| Existing rule removal/Undo and wording identity | `src/data/vault/drive-vault.ts:1350`, `:1383`; `src/data/vault/undo-compensate.test.ts:183`, `:358`, `:371` |
| Ordered rule replay shared by app, planner and author | `src/data/contracts/note-edit.ts:714`, `:748`; older removal/no-removal ordering stays lenient |
| Rules wording refuses plain/v2, preserves outside its first Rules section | `src/data/contracts/note-edit.ts:741–769`, `:794–821` |
| Planner defers unwordable rule lines, uses the author and parser counts | `src/data/spine/scripted.ts:1338`, `:2472`, `:2480–2526` |
| Exact-template repair only, version fence and lost-response resolution | `runner/src/rules-repair.ts:40–60`; `runner/src/main.ts:272–274`; `runner/test/rules-repair.test.ts:74`, `:121` |
| Raw model read, bound, cut marker, precedence, basis | `runner/src/claude.ts:158`, `:190`, `:244`, `:395–399`, `:758`; tests `runner/test/claude-provider.test.ts:201`, `:232` |
| Existing app content write/fence pattern | `src/data/vault/drive-vault.ts:502–517`, `:1825–1841`; `src/data/drive/drive-api.ts:113`; `src/data/spine/write-once.ts:156` |
| Person action and current rule toast/removal toast | `src/features/bower/BowerScreen.tsx:51–76`; no conversion action today |
| Demo synthesizes Rules from its rule array | `src/data/demo/world.ts:344`, `:842`; cannot prove raw conversion by testing demo alone |
| Real API-to-run test without network | `src/data/contract/real.contract.test.ts:39`, `:67`; replayed Drive/Worker plus runner main |
| Corpus driver reaches production main and exposes model input | `runner/test/corpus-run.ts:19`, `:78`, `:83`; `runner/test/corpus-driver.test.ts:19` |
| Internal paths; visible root rules | `src/data/vault/layout.ts:23–49`; TL-P4-45 at `docs/harness/DECISIONS.md:461` |

### Gap table

| Checkable promise | Today | Needed |
| --- | --- | --- |
| No automatic adoption of personal original | Exact-template exception only; original-with-rules protected | Preserve this; add explicit-action proof, including addRule without consent |
| Lossless management of new additions beside original | Plain file cannot be worded | Explicit converted shape, immutable original span, existing managed rules grammar |
| App distinguishes personal source from managed cards | Rule[] only; partial legacy parse can look complete | Typed document state and signed presentation; no arbitrary prose as fabricated cards |
| Management grants only its own region | Legacy by: bower permits more than rule edits | Shared author's protected-span invariant; app task writer must also respect the boundary |
| Explicit adoption and reversible write | No vault API | One fenced, stamped write and inverse closure, with conflict behaviour |
| Rule add/removal/Undo works after adoption | Works on generated files | Re-run it on converted bytes via vault API and tidy-up, not a serializer-only test |
| Conversion does not eat model budget | Model bounds raw file including metadata | Project converted shape only, in existing rules slot; preserve legacy input |
| Old repair remains distinct | Equality checks plus four real-adapter tests | Keep them unchanged; new original tests must not claim all unmarked files are repairable |

### Proposed packets (exact owned files)

Names below are suggested entries for the lead. No feature registry, packet, app or runner change is made here.
Each implementation packet should include its named red before implementation, then its normal check/e2e
gates. This preparation ran only existing rules tests, not those gates.

| Entry | Exact owned files | Dependencies / escalation |
| --- | --- | --- |
| `rules-conversion-format` | `src/data/contracts/rules-format.ts`; `src/data/contracts/note-edit.ts`; `src/data/contracts/note-edit.test.ts`; `src/data/contracts/note-format.ts`; `src/data/vault/note-format.test.ts`; `src/data/vault/rules-format.test.ts` | Q1–Q3, Q6–Q8 ruled; D2 copy/boundary approved before persisted visible text. **Escalated: contracts and note-edit.** Note-format only hides the internal version property through its existing exclusion. No new manifest effect or Change kind. |
| `rules-conversion-vault` | `src/data/sources.ts`; `src/data/vault/drive-vault.ts`; `src/data/vault/rules-conversion.test.ts` (new); `src/data/contract/real.contract.test.ts`; `src/data/demo/world.ts`; `src/data/demo/world.test.ts` | Format landed; Q4–Q6 ruled; real/fake share DriveVault, demo implements the same public semantics. Conversion/Undo and task-boundary tests go through vault methods. Coordinate sources.ts consumers; no brain wire change. |
| `rules-conversion-model` | `runner/src/claude.ts`; `runner/test/claude-provider.test.ts`; `runner/test/corpus-driver.test.ts`; `harness/corpus/rules-original-model/case.json`; `harness/corpus/rules-original-model/expected.json`; `harness/corpus/rules-original-model/rubric.md`; `harness/corpus/rules-original-model/folder/Rules.md`; `harness/corpus/rules-converted-model/case.json`; `harness/corpus/rules-converted-model/expected.json`; `harness/corpus/rules-converted-model/rubric.md`; `harness/corpus/rules-converted-model/folder/Rules.md`; `harness/corpus/rules-converted-cut/case.json`; `harness/corpus/rules-converted-cut/expected.json`; `harness/corpus/rules-converted-cut/rubric.md`; `harness/corpus/rules-converted-cut/folder/Rules.md` | Format/projection landed; Q7 ruled. These corpus files are **conditional** on a changed model view; use existing driver callbacks and recorded replies, no driver schema extension. Corpus piles may be words-only, so no inbox asset is required. loadCase requires rubric.md (`runner/src/corpus.ts:190`). |
| `rules-conversion-ui` | `src/data/provider.tsx`; `src/features/bower/BowerScreen.tsx`; `src/features/bower/BowerScreen.test.tsx`; `src/features/bower/bower.module.css`; `e2e/rules-conversion.spec.ts` (new) | Vault and model packets landed; designer spec and owner's OK for D1–D3 first; ui: true, designer check before close. Exact surface is provisional: if designer chooses another surface, the lead recuts owned files before assigning it. |

There is **no proposed ownership of `src/data/spine/scripted.ts`**, `run-manifest.ts`, `journal-record.ts`,
`ownership-format.ts`, brain schemas, layout paths, template repair, Worker routes or API code. The proposed
legacy-shaped managed section lets existing `parseRules`/`ruleSequence`/`applyChanges` feed scripted's
existing counts and dependencies. `rules-conversion-format` owns the required original-span gate in
note-edit because simply prepending `by: bower` would broaden permissions. If that shape requires a
scripted or brain-contract change on the updated integration baseline, stop and bring the exact reason
to the lead; it is not silently in scope. Contracts and note-edit remain escalated even without a wire change.

Integration dependencies: refresh onto accepted rules/Undo ordering and template repair; coordinate
`note-edit.ts` with C05 and brain region work, `claude.ts` with context-tier/model-input work, and
`provider.tsx` with its loading-store consolidation. Root Rules remains content under TL-P4-45;
conversion neither reads nor writes index/hot/log. Review existing legacy-manifest fixtures and input
goldens when implementation starts; this prep does not change their order, budgets or baselines.

## 3. Questions for the lead and designer

There are **11 open questions: 8 contract questions and 3 UI questions**. Recommendations are proposals,
not rulings. No permission question was sent to the owner by this worker.

| Id | Question for lead | Recommendation |
| --- | --- | --- |
| Q1 | Does management cover only new app rules, or individually importing/removing every existing prose rule? | Manage new additions beside the original active source. Do not infer/import original cards. Wider individual removal needs a separate authority ruling, since an active preserved source would override deletion of its copy. |
| Q2 | What persisted boundary makes only the new region Bower's, and does it override generic link rewriting inside the source? | Generated versioned prefix plus fixed source separator; original is an immutable byte span for all automatic edits. Escalate the shared note-edit guard. Explicitly rule its interaction with TL-P4-32 addendum 1's ordinary personal-link rewriting; do not pretend the file-wide mark alone protects it. |
| Q3 | Is front-matter ownership sufficient, or must conversion also set PROP.by as templates do? | Use front matter for rule authority, retaining other appProperties. wordRules already does this. If PROP.by is required, rule atomic restoration first; do not add a metadata transaction or weaken Undo. |
| Q4 | Which exact action authorizes conversion, and may addRule implicitly grant it? | Separate explicit consent on the existing rules surface, via typed state and convertRules(id, shownVersion). No addRule/dismissSuggestion/tidy-up implicit grant. The app's format-adoption write is the narrowly ruled exception; rule wording stays with the runner. |
| Q5 | What does conversion Undo promise after later work or a reload? | Restore exact original bytes only while the conversion result is still as seen; otherwise conflict/refresh. Preserve all journal lines. A later pending add is not undone, and may wait for re-adoption. No durable Undo ledger. Designer must word this limited promise. |
| Q6 | Which limits apply to conversion and ambiguous or already managed documents? | Fatal UTF-8 validation and existing 1 MiB bound including prefix; identify exactly one eligible root id; refuse/reload ambiguity; already converted is an idempotent no-op; keep legacy managed files and exact-template repair unchanged. No per-shape UI. |
| Q7 | May the model view project away conversion scaffolding, and what has priority under the same bound? | Original first, managed section second when nonempty; bound the single projection at today's 4,000 units, with current marked cut and basis checks. Empty adoption preserves the old model input exactly. No budget increase; existing legacy inputs remain raw. |
| Q8 | How are old rules displayed, deduped and counted once they are preserved source? | Raw source separate from managed Rule[]; managed parser excludes original bytes. Do not count/import old prose as new rulesWorded or journal changes. Keep existing managed-rule dedupe; do not claim semantic dedupe against arbitrary original prose. Generated summary must not say zero rules are followed when the source is active. |

| Id | Question for designer, requiring owner OK under TL-P4-40 | Recommendation to discuss, not approved copy |
| --- | --- | --- |
| D1 | Where is the one consent action, and how is the preserved original shown beside managed cards on phone/desktop and through the existing note viewer? | Existing rules surface, one explanation/action, raw original available without fabricated Remove controls; no wizard. Explain that Bower already reads the original, while management enables new additions. Include any change to the note viewer's task interactions in the approval; recut UI owned files if that viewer needs a change. |
| D2 | What are the visible source separator, summary, consent explanation and post-adoption/pending-rule outcomes? | Sentence case, plain words, no filename/jargon in sentences. Include file appearance in another editor; avoid a managed-only count that misstates all followed rules. UI and file text both need approval. |
| D3 | What does the adoption Undo say, including version conflict, reload and still-pending additions? | Reuse the existing confirmation/Undo presentation. Promise reversal of adoption only, not later work or a permanent restore facility. State pending outcomes honestly and reuse conflict/retry presentation. |

## 4. Proposed reds through real entry points

These are proposed tests, **not executed reds**. API names below are draft Q4; until ratified, no test
should fail only on a missing export or compile error. The red-owning packet first declares the agreed
typed surface with a refusal/no-op implementation, then records the specific failing assertion.
Green regression guards are identified separately; do not label today's passing protections as reds.

| Proposed name | Production entry point / fixture | Assertion that must fail today |
| --- | --- | --- |
| `explicit_conversion_keeps_original_bytes` | Real live vault over replayed DriveHttp, convertRules, then fresh read by id | Consent succeeds, preserves exact source bytes and id/name/parent, and exposes managed document state. Today there is no explicit adoption path. Table: LF/CRLF, café/emoji, BOM, no final newline, prose, existing ## Rules/Current state, fences; never substitute normalized equality. |
| `converted_rules_add_and_undo_preserve_source` | Vault convertRules → addRule → real tidy-up; removeRule → returned Undo → tidy-up | One managed worded rule, its exact yourWords, removal and restoration; original span byte-equal throughout. Today addRule on personal plain bytes stays pending because note-edit refuses not-bower. Seed with original source still unowned, not with serialized Bower rules. |
| `converted_suggestion_undo_uses_worded_identity` | Vault adoption → dismissSuggestion(id, true) → tidy-up → Undo → tidy-up | Full-stop-worded suggestion absent from managed parse; source identical. Existing test at undo-compensate.test.ts:358 covers managed files, not adoption of an original. Today the original cannot be adopted/worded. |
| `converted_document_parser_exposes_original_bytes` | Rules-format's proposed typed readRulesDocument entry point, using parseRules for the managed list; legacy fixtures alongside | The parser returns converted mode, exact original byte span/text, and only managed Rule entries. Today's rules parser returns only Rule[] and has no source-span result; the declared legacy-only baseline returns no source span, so the assertion fails. parseRules's existing first-section exclusion is an already-green guard, not claimed as a new red. |
| `conversion_version_is_internal_not_a_property` | Existing parseNote entry point on the proposed converted prefix | No displayed property has key bower_rules_original, while ordinary properties still parse. Today note-format's internal-key list omits it, so it appears as a property. This is a concrete parser assertion, not a missing-export failure. |
| `converted_source_is_protected_from_automatic_edits` | applyChanges on converted bytes with valid rule-wording and separately valid link/state/Timeline edits targeting the source | Rules wording succeeds and preserves source; edits that alter source are refused by the same author. Today a legacy file-wide by: bower grants ordinary link edits, and original embedded sections are not separately protected. This is the required note-edit red, especially for an original [[Old]] link. |
| `conversion_undo_restores_exact_original` | Vault conversion → returned Undo; inspect current media by id | Exact original bytes restored, no new files, and pending journal lines retained. Today the reversible adoption API does not exist. |
| `conversion_write_and_undo_use_seen_version` | Real vault, Drive replay hop changes bytes after read and before each write; lost-response replay on a separate normal write | A stale adoption/Undo refuses and retains the newer bytes; a landed lost-response update is confirmed once, without duplicated prefixes. The existing transport already fences writes, but there is no adoption operation wired to it; test that operation, not the helper in isolation. |
| `converted_model_projection_keeps_original_priority` | runWithClaude → runner main with recorded reply and captured spawn input | For empty converted document, rules input equals plain original exactly; after an addition, source precedes managed rules and no scaffolding is shown. Today the runner shows generated metadata/prelude as raw text. |
| `converted_model_cut_is_honest_and_basis_is_visible` | Same main/corpus driver; long converted source, recorded reply citing visible or cut rule | Original occupies the first 4,000-unit payload window; correct omitted count and rules-specific marker; whole shown rule basis accepted, cut/hidden/metadata basis refused. Today prefix overhead displaces original text, and generated headings can satisfy the generic whole-line matcher. |

Keep these **already-green guards** alongside the reds: no conversion on read/addRule/tidy-up without
consent; original-with-rules is not exact-template repair; old Rules parser/serializer round trips;
duplicate managed adds; equal-time removal/add ordering; old manifests without removal since; no app
writes to runner `.bower/` files; conflict preservation, and no hard delete. The app's task writer bypasses
applyChanges (`drive-vault.ts:502`), so the vault packet also asserts that converted-source checkboxes
cannot be changed by that path and that ordinary personal-note task toggles remain supported. Do not
introduce a second protection parser there: use the same rules-format span/state helper.

Conditional corpus proposals (only if Q7 changes the model view):

1. `rules-original-model`: unowned plain prose plus bullets instruct a made-up placement; capture model
   input through main, cite a whole visible original line, assert no Rules media/property changes and
   zero rulesWorded. This plain case is a golden/control; it is not itself expected red today.
2. `rules-converted-model`: the same source with adopted empty prefix, then with one managed addition.
   Compare empty-adoption input to case 1, assert original-first/new-rule-second and matching placement.
   Use the driver's existing before callback to exercise vault adoption where needed; no new corpus
   action kind or schema. Original bytes stay protected in final output.
3. `rules-converted-cut`: an original long enough to cross the current bound, with complete visible
   rule, partial rule and hidden rule, plus a managed addition. Assert exact input/cut marker and
   basis refusal/retry through main, with no semantic expectation requiring unseen text.

Driver tests should capture exact input, not only score placement. Use recorded intent replies, fake
timers and injected transports; no live Claude, Drive or network. Existing scorer/protected-range support
and direct byte assertions suffice; no scorer extension is proposed. If the lead chooses unchanged raw
input for all formats instead, remove the projection packet/tests, but assess the actual header-induced
model input/budget change before deciding that corpus coverage is unnecessary.

## Today's rules-test evidence

All commands used `--maxWorkers=2`, sequentially, with output redirected under `tmp-logs/`. Only existing
rules tests were selected by names found with rg; no app/runner source, tests or corpus fixtures changed.
No init, check, build, e2e, git-write command or network operation was run.

| Run | Result | Log |
| --- | --- | --- |
| Parser, rules-wording, vault rules/Undo, fake tidy-up, scripted rule dependency (six existing files, name filter) | 33 passed, 366 skipped by filter; 6 files passed; exit 0 | `tmp-logs/rules-conversion-app-baseline.log` |
| Real runner template repair and provider rules/basis (two existing files, name filter) | 7 passed, 20 skipped by filter; 2 files passed; exit 0 | `tmp-logs/rules-conversion-runner-baseline.log`; JSON `tmp-logs/rules-conversion-runner-baseline.json` |
| Existing rule contract cases across demo/fake/real adapters (four named cases per source) | 12 passed, 110 skipped by filter; 3 files passed; exit 0 | `tmp-logs/rules-conversion-vault-contract-baseline.log` |

Total: **52 existing rules tests passed**, no failures. Skips are name-filter exclusions, not new .skip
annotations. This proves the current supported rules/template/Undo baseline, not original conversion.

Exact commands, reproducible from the worktree root:

```sh
pnpm exec vitest run src/data/vault/rules-format.test.ts src/data/contracts/note-edit.test.ts src/data/vault/drive-vault.test.ts src/data/vault/undo-compensate.test.ts src/data/fake/fake-runner.test.ts src/data/spine/scripted.test.ts --maxWorkers=2 -t 'Rules\.md|rules-wording|rules:|removeRule|suggestion.*rule|rule added|rule removal|rule pair|worded rule|rules at equal since|later rule inverse|a rule waits|a rule can be removed|pending rules|a source document that tells Bower to change a rule' > tmp-logs/rules-conversion-app-baseline.log 2>&1
pnpm -C runner exec vitest run test/rules-repair.test.ts test/claude-provider.test.ts --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=../tmp-logs/rules-conversion-runner-baseline.json -t 'Rules\.md|rule basis|cited rule' > tmp-logs/rules-conversion-runner-baseline.log 2>&1
pnpm exec vitest run src/data/contract/demo.contract.test.ts src/data/contract/fake.contract.test.ts src/data/contract/real.contract.test.ts --maxWorkers=2 -t 'addRule shows as pending|a rule is kept once|a rule can be removed, worded or waiting|removing a waiting rule' > tmp-logs/rules-conversion-vault-contract-baseline.log 2>&1
```

Handoff state: lead rules Q1–Q8, designer takes D1–D3 to the owner, then lead cuts the escalated format
packet and dependent packets. Preparation is complete; implementation, UI approval and commits are left
to their assigned sessions/coordinator.
