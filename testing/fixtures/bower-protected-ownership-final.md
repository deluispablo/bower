# Protected ownership grammar — final lead-ready proposal

**Final replacement proposal only. No grammar, schema, producer, migration or UI flow is adopted.** Original and revised drafts/fixtures remain unchanged for review provenance. This replacement addresses the mechanical-operation restriction and missing raw-byte capability identified independently; it retains one ownership/2 syntax and the original legacy/nofrontmatter behavior. Contracts-2/P2/C03,C05,C14,C16. Original inspected integration target `907c9f806e4e6c6b33e595c33232e27257913fdf`; final O3 proposal reference `fe9a965d478fbe35b7f21eaa84d500cf590cf362`, identical production source `44ee162abfeb77ec168d18b5e66cd24a43619915`. Independent author did not implement that source. No repository/shared edits, gates, builds, provider/model calls or delegation. Private fixtures are proposed expectations, not tests or evidence of a working parser.

Lead direction received through coordinator: preserve exactly legacy grammar and personal notes without frontmatter; do not reserve My notes or ordinary headings universally; use explicit version/unambiguous owner spans for new rich format, preserve source bytes and separate rendering from mutation. Lead endorses direction only. This draft answers the exact syntax/compatibility question for independent review and lead decision.

## Final minor-correction delta and recovery classification

This final replacement changes fixture request precision and recovery guidance only; ownership/2 syntax, legacy/nofrontmatter grammar, mechanical recovery and future raw-byte/activation dependencies remain the single proposal. All 18 input bytes and all seven toggle expected files are identical to the revised packet. The original/revised documents and manifests are untouched. No parser, app, test or browser was executed.

Every toggle expected file now names its requested index, label, prior done state and requested done state, plus expected result and toggle-back request. All requests target label Personal task, previous_done=false, requested_done=true; all outputs have done=true. Legacy-rich-ambiguous targets index **1**, because Disputed task is index0. Legacy-canonical, legacy-no-frontmatter, plain-marker-looking, v2-rich, v2-crlf and v2-fence-escape target index0. Toggling the same selected task back requests true→false and restores the exact input hash. These are unambiguous future assertion inputs, not executed behavior.

Recovery classification is explicit in the manifest even where expected_status remains invalid: invalid-unknown-version is unsupported-version; known ownership/2 missing/reversed/duplicate/unknown block/unclosed fence/outside-content cases are damaged-boundary; invalid-utf8 is invalid-encoding. An unsupported version means the reader lacks that declared format: preserve it, use a supporting reader or export/copy unchanged bytes, and never auto-repair by guessing spans or changing its version marker. A damaged known-version boundary allows only the separately authorized raw-source repair preview/confirmation, not guessed edits. Invalid encoding needs actual undecoded-byte recovery, not re-encoding replacement characters. Each refusal preserves independently guarded move/rename/Bin/restore.

Private consistency inspection checks recorded 18 input sizes/hashes, seven expected toggle hashes/one-byte space→x deltas and both metadata examples' base64 bytes against inputs. It does not invoke a parser/renderer/writer or establish adopted tests. The final manifest records revised-manifest provenance. Bundle SHA256SUMS identifies the final draft and every fixture file for immutable review; changing any file invalidates that identity and requires renewed review.

## Existing facts to preserve

`src/data/vault/note-format.ts` currently treats notes without frontmatter as personal; after frontmatter it consumes only contiguous `- ` Current state lines, then the unheaded body, with trailing Timeline/Bower's note recognized by existing headings. `toggleTaskInText` maps normalized offsets back to raw source and replaces one checkbox character. Current state is `string[]` in `src/data/types.ts`, rendered as read-only list in NoteScreen. The fake runner's `addTimeline` parses then serializes the whole note; this is not a lossless rich-source mutation path. Current Markdown rendering/task indexing lacks fenced-code handling. A marker-only rollout would let old readers treat rich protected task lines as personal. None of those limitations is fixed by this document.

## Proposed format `ownership/2`

Opt-in requires one exact frontmatter key/value `bower_format: ownership/2` in a closed frontmatter block at the beginning of the file. No other version/duplicate key is accepted. Existing summary/properties remain separate metadata; frontmatter is never a personal editing range. The key becomes reserved structural metadata only under this proposed reader. No-frontmatter notes remain wholly personal even when they contain ownership-looking comment text. Ordinary headings, blank lines and task syntax never establish v2 ownership.

Canonical example (LF shown; CRLF and mixed LF/CRLF preserved):

```markdown
---
bower_format: ownership/2
summary: Synthetic garden
by: bower
---

<!-- bower:ownership/2 begin current -->
## Current state
Protected prose and tables may go here.
- [ ] This is protected content.
<!-- bower:ownership/2 end current -->
<!-- bower:ownership/2 begin personal -->
My own paragraph.
## My notes
- [ ] This is my task.
<!-- bower:ownership/2 end personal -->
<!-- bower:ownership/2 begin timeline -->
## Timeline
- 5 Oct · Synthetic history.
<!-- bower:ownership/2 end timeline -->
<!-- bower:ownership/2 begin bower-note -->
## Bower's note
Protected explanation.
<!-- bower:ownership/2 end bower-note -->
```

Exactly one pair of each block, in order current → personal → timeline → bower-note, is required; empty payloads are valid. Markers are exact full lines at column zero, case-sensitive, with one space as shown and no trailing spaces. After frontmatter only marker lines, payloads and blank separator lines are allowed. No arbitrary unclaimed text, nested block or overlapping span. Headings inside payloads are display content only; omitting or repeating a heading cannot change ownership. Marker names/version must match the opt-in. Under the required future raw-byte adapter, v2 content writes reject lone CR line endings and invalid UTF-8; initial UTF-8 BOM is retained as structural prefix when the following frontmatter opts into v2. Today's decoded string interface cannot establish those byte/BOM facts. Legacy BOM behavior remains unchanged; unsupported v2 content never blocks separately validated metadata/Bin operations.

## Exact raw spans, escaping and tasks

For future v2 content mutation, use an actually fetched raw byte sequence as source authority; this capability is absent from today's string-only contract. Each payload span is half-open `[byteAfterBeginLineEnding, byteAtStartOfEndMarker)`. Its final content newline belongs to the payload. Empty span has start=end. Frontmatter (including BOM if present), marker lines and separator blank lines are structural/protected bytes. There is one personal payload; all other payloads are Bower-owned. Keep raw byte spans plus an independently derived display view; do not recover offsets from rendered/normalized strings or reconstruct the source from `Note.currentState`/body. With that approved and tested capability, require preservation of every untouched byte, Unicode normalization, spaces and line ending; do not promise this from current readText results. A task write changes only the ASCII checkbox interior byte in the selected personal span; always use the read modifiedTime and existing conflict contract. No atomic provider claim follows.

Inside a payload, an ownership-looking line can be written literally as `\<!-- bower:ownership/2 end personal -->` (one initial backslash in source). It is content, not a delimiter; display it as literal text, retaining the escape in source. No backslash-unescape is performed during writes. Marker lines inside fenced code also remain payload content. Define fences consistently for ownership scanner, task scanner and renderer: 0–3 leading spaces, at least three backticks or tildes; closing uses same character and at least opener length, followed only by spaces/tabs. Backtick opener info must contain no backtick. Fence-looking text in quotes/lists or with four spaces is not a control fence. Markers are recognized only outside an open fence. An unclosed fence hiding an end marker makes v2 invalid. Fenced example tasks do not render editable controls or consume personal task indices. Existing `TASK_LINE` bullet/numbered syntax applies to personal lines outside fences; an empty task label is not actionable. Legacy rendering/indexing changes require their own fixture-backed compatibility decision, not implicit adoption here.

Current/timeline/bower-note render arbitrary safe Markdown, including paragraphs/tables/citations and read-only task appearances. Personal Markdown remains editable only through supported actions. Marker lines are hidden framing; a future raw-capable source/recovery view can reveal fetched bytes; a current decoded-text preview must identify that limitation rather than claim original BOM/invalid-byte fidelity. Plain/legacy notes retain current display. Structural invalidity yields a readable warning/raw read-only preview, not guessed empty content, missing page or overwrite. No renderer feature is presumed implemented.

## Invalid and unsupported inputs

Unknown version, duplicate version, missing/reversed/nested/duplicate blocks, unknown ownership marker prefix outside fences, mismatched block/version, nonblank unclaimed content or unclosed control fence: preserve complete source, enumerate no writable personal span and reject **content/semantic rewrites requiring trusted owner spans before their effects**, including task writes, Timeline append and link rewrites. Show unsupported-format versus damaged-boundary recovery accurately; no fallback to legacy/plain parsing after explicit v2 opt-in. Other notes continue working. Separately validated move, rename, Bin and restore remain supported for this same invalid/unknown-format file; they need no parsed body or trusted owner span and must not read/serialize/rewrite its content as a prerequisite. Marker-like ordinary text without v2 frontmatter does not trigger this refusal. Unterminated legacy frontmatter without a valid opt-in retains current plain-note interpretation; do not invent protection from an ordinary text line.

For valid v2, task toggle may affect personal only; Timeline append may change Timeline payload only (insert before its end marker, respecting neighboring ending convention); rich state updates may replace Current payload only; runner link rewrites must obey explicit authorized ranges rather than global text replacement. Existing content version checks remain. Any broad property or semantic write needs separately defined authority. Invalid-file preflight must happen before pile effects; this is a proposal for that dependent assignment, not a claim of existing transaction/recovery.

## Content refusal does not remove mechanical recovery

Ownership trust is required for content changes and semantic application, not for unrelated provider metadata. Move/rename use existing fresh account/folder binding, path/name validation and stillAsSeen name/place guards. Bin uses the existing fresh ownership/lifecycle/version guards and soft trash only; restore uses fresh untrash metadata and existing conflict behavior. Preserve those operations even when v2 parsing fails or version is unknown. Do not turn an invalid body into a not-found file. No writeText/serialization/content normalization is allowed as part of move/rename/Bin/restore. If an action combines metadata and a content rewrite, expose or reject its owner-dependent content component rather than quietly performing a semantic subset; ordinary standalone mechanical actions remain available. Metadata failure reports its own readable error, not an ownership-format error.

The fixtures invalid-missing-end.metadata-operations.json and invalid-unknown-version.metadata-operations.json specify exact input bytes/base64/hash, initial file ID/name/parent/version, sequential expected move→rename→Bin→restore fields, content identity, and refused content/stale-move cases. These expectations are not execution: full byte equality requires future raw reads or a test adapter carrying real bytes. Existing provider atomicity limitations are retained; metadata-only transport means the app did not rewrite content, not that an external client cannot change it concurrently.

## Required future raw-byte capability before v2 activation

At this exact source, DriveApi.readText returns Promise<string> (drive-api.ts:32); DriveHttp.readText calls Response.text() (drive-http.ts:102–104), and writeText sends a string (:143–146). Decoding can discard BOM or replace invalid UTF-8, so re-encoding a returned string cannot prove original-byte identity or reconstruct discarded provenance. Existing checkbox tests establish preservation of supplied strings; they do not certify arbitrary original network bytes.

Proposed typed adapter extension for lead approval, not an adopted interface:

```typescript
interface ProposedRawContentAdapter {
  readBytes(id: string): Promise<Uint8Array>;
  writeBytes(id: string, bytes: Uint8Array, ifModified: string): Promise<DriveFile>;
  createBytes(parentId: string, name: string, bytes: Uint8Array): Promise<DriveFile>;
}
```

DriveFile is the existing metadata type. Reads must return undecoded media bytes; raw writes/copies must send supplied bytes without text encoding/normalization. Capture fresh file metadata, actual bytes and hashes; separately specify/prove how a content read is associated with its version before relying on it for a precondition. A re-read comparison is not an atomic compare-and-swap. Required adapter conformance covers BOM, invalid UTF-8 rejection before content writes, LF/CRLF/mixed endings, Unicode, exact splice/copy identity, fresh conflict and lost-response reconciliation. No transport/version guarantee is implemented or certified here. Legacy read/display/tasks continue under existing string contract; raw-capability absence blocks new v2 producers/migration and raw-byte promises, not supported legacy operations or metadata recovery. Raw recovery backups must use approved readBytes/createBytes or equivalent tested raw copy, never reconstruct bytes from Response.text.

## Legacy ambiguity and genuine recovery

Keep the exact legacy grammar and supported personal tasks by default. In particular, contiguous Current state bullets followed by unheaded paragraph/task remain protected bullets plus personal body; My notes remains an ordinary personal heading. The identical bytes can also express someone's intended rich protected prose. No parser can infer that intent. This draft does not solve the ambiguity by absorbing all following prose or disabling every frontmatter note.

Proposed recovery interaction: person chooses “Set which parts Bower may change” on one note; display full raw lines and current ownership preview. They explicitly select Current, personal, Timeline and Bower note boundaries; no automatic cut at My notes. Require the approved raw-byte adapter and a separate explicit confirmation for any legacy body byte being reclassified as protected, showing the changed ranges and personal tasks that would cease to be editable. Empty/no rich conversion can be cancelled with zero writes and existing task behavior intact. Preserve original bytes in an immutable synthetic/testable recovery copy and record the exact source version; conversion inserts framing/version metadata around selected contiguous slices without normalizing payload. If selection cannot express four ordered contiguous slices, refuse conversion and offer copying the desired protected material into a **new** explicitly framed note while leaving the original intact. Never silently delete/flatten/move original prose.

If a person declares a specific legacy range disputed before conversion, refuse content writes touching that range while still allowing tasks in other established personal spans; do not declare that note rich-compatible. This optional local recovery interaction and its persistence need a separately adopted implementation contract. An unannotated ambiguous file remains legacy-supported; intended richer ownership cannot be certified until explicit confirmation. Changed modifiedTime between preview/copy/commit means stop and rebuild the preview; an already issued copy/write is reconciled rather than presumed rolled back. Recovery copies and old/new migration must pass real boundary risk checks before promising durable rollback.

## Compatibility, activation and rollback gate

This is a breaking storage grammar, **not a safe additive key/comment change**. Approved raw adapter/write capability and reader preparation precede every new producer. A compatibility reader must understand valid v2 or visibly refuse unknown/invalid owner-dependent content formats before tasks, semantic/runner content writes and content-repair conversion. Its independent move/rename/Bin/restore paths remain available and must never require successful ownership parsing. Old persisted legacy bytes stay byte-for-byte unchanged; no mass rewrite. Negotiation/gate must cover every app and runner able to write the folder, including cached/offline clients. The current old app ignores new metadata and can edit protected tasks; merely changing Worker responses cannot stop its direct Drive write.

Therefore no in-place v2 production activation/migration while an unpatched old reader can still write the folder. A minimum-client setting alone is insufficient unless enforcement is actually demonstrated. If the direct-write boundary cannot exclude those writers, activation remains blocked and legacy remains supported; the lead must choose an independently tested isolation/permission strategy rather than claim compatibility. External notes tools can still edit Markdown; v2 is an application ownership convention, not provider access control.

Rollback target must retain the compatibility/refusal reader. Rolling back to today's unpatched source against a folder containing v2 is unsafe and prohibited. Downgrading v2 rich content into legacy bullets is not lossless: it requires an explicit reviewed conversion/copy preserving raw original and confirming ownership, or keeping v2 content read-only under the compatibility reader while independent metadata/Bin operations remain available. Do not silently flatten tables/prose or strip markers to “restore” old readability. Unknown future versions refuse owner-dependent content writes visibly, preserving independent metadata/Bin operations. Version/migration recovery is not accepted until old/new/invalid writer tests, byte comparisons, two-client version conflicts and rollback fixtures pass.

## Exact-byte proposed fixture matrix

Directory [fixtures](/private/tmp/bower-protected-ownership-fixtures-final/manifest.json) contains the original 16 input examples plus BOM and invalid-UTF8 raw-byte examples and proposed checkbox-only output files where applicable. Manifest includes exact raw personal text, byte-span offsets where nonempty, byte counts and SHA-256 for inputs/expected toggles. They are generated examples only: **no parser, renderer, writer or test was run**. Expected writes below describe future allowed behavior, not baseline success.

| Input file stem | Proposed ownership/tasks | Expected write/recovery |
| --- | --- | --- |
| legacy-canonical | Existing state bullets protected; paragraph/My notes/personal task body | Task0 one checkbox byte; retain legacy support |
| legacy-no-frontmatter | Entire note personal, including Current state/Timeline headings | Personal task remains supported |
| legacy-rich-ambiguous | Existing legacy body includes Disputed task and Personal task | No automatic rich protection; explicit selection/reclassification preview |
| plain-marker-looking | No-frontmatter comment block wholly personal | Task0 remains supported; no inferred ownership |
| v2-rich | Rich Current/table/protected task, personal span with one task | Personal task0 only; owned bytes unchanged |
| v2-crlf | Same raw owner spans with CRLF and Unicode | Exact expected output preserves all other bytes; toggle back restores input |
| v2-fence-escape | Fenced marker/task and escaped marker personal content; only real Personal task indexed | Fence ignored for delimiters/tasks; real checkbox-only write |
| v2-empty-personal | Begin-personal end offset equals end-personal start; zero tasks | Task write refused; owned operations confined to own spans |
| invalid-missing-end / invalid-reversed | No trusted content-writable spans | Content rewrites refused; independent guarded move/rename/Bin/restore available; boundary repair preview |
| invalid-duplicate-personal / invalid-duplicate-version | No trusted content-writable spans | Same content refusal, metadata operations remain; no first/last-wins |
| invalid-unknown-version / invalid-unknown-block | No trusted content-writable spans | Visible content refusal, metadata operations remain; no legacy fallback |
| invalid-unclosed-fence / invalid-outside-content | No trusted content-writable spans | No guessed content span; preserve and repair, retain guarded metadata operations |

Manifest also supplies exact recovery examples: explicit reclassification of legacy-rich-ambiguous produces recovery-confirmed-expected.md with Disputed task protected and Personal task0 editable; cancellation produces identical recovery-cancelled-expected.md with both legacy tasks unchanged; recovery-external-change-input.md represents a changed source version, so confirming the old preview must write nothing and rebuild the preview. Valid v2 fixtures include expected UTF-8 payload spans for all four owners; these offsets describe fixture construction, not output of a tested parser.

Additional fixture expectations: v2-bom preserves the initial EF BB BF bytes only with the future raw capability; invalid-utf8 contains an actual FF byte and refuses content rewrite while guarded mechanical actions remain available. Neither can be certified through today's decoded strings. New metadata-operation examples make the important C03 distinction explicit.

Additional assigned tests must preserve existing names: round-trips every demo note; a note with no frontmatter is all body; toggleTaskInText flips only the n-th body task and returns its label; toggleTaskInText ignores tasks in Current state and Timeline; ticks a task in a numbered list, as the screen counts it; toggling a personal task preserves every other source byte; vault-contract toggleTask flips the n-th body task only / toggleTask never touches Current state or Timeline. New reader/task/render alignment, raw Timeline append, legacy/property round trip, invalid preflight, migration cancellation/conflict/retry and rollback tests must be separately authored with actual assertion failures. No invented test name is counted as coverage.

Next decision: lead approve/revise this one grammar, raw-byte adapter/write capability, content-versus-metadata recovery authority and enforceable compatibility activation strategy; independent reviewer checks fixture expectations and old-reader hazard; coordinator then reserves one precise implementation slice with actual tests/paths. Browser inventory report is [NOT RUN evidence](/private/tmp/bower-evaluator-capabilities-current.md). R1–R4 and complete rich-state/product acceptance remain unresolved. Coordinator reports verified owner adoption of offline read-only behavior and upload best-effort/reselect policies through lead decision 01a10cf5; those rulings do not approve this grammar or certify implementation. This correction adds no policy or producer behavior.
