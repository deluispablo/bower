# smoke-request-slow — red delivery

implementer: codex

HEAD: `8298725934e68919d2e71901a98b84ef17de5fe6`.
Worktree: `/private/tmp/bower-smoke-request-slow`, branch `smoke-request-slow`.
Tests only; no implementation, existing-test edits, git writes, network, live Drive or real waits.
The coordinator owns both commits (tests first, then these notes separately).

## Reds

Every test below is in `runner/test/c05-bounded-reads.test.ts`.

1. `C05 bounded reads: golden: 50 archived requests and 25 kept runs cost no historical media`
   - Positive controls: real C04 pile run, exactly 15 reads in runner timing; fresh request without history,
     10 reads and the signed NOTHING_FOUND_WHY row. Both finish successfully.
   - HEAD: 50 unrelated archive media reads and 75 unrelated manifest/checkpoint media reads;
     the request-only run has 137 reads, exceeding the pile baseline of 15.
   - No waiting requests: a pile run with the same marked history reads 75 historical records,
     with 84 reads in the reads phase. It must read none of that history.
   - No migration: a real clashed staging request placed directly in changes is treated as new.
     HEAD instead reads five old records, retries its old binding, appends to the renamed old target,
     records a completion, and omits the new target's NOTHING_FOUND_WHY row.
2. `C05 bounded reads: pending: a clash moves by run id and retries only its bound evidence`
   - Positive controls: an ordinary personal append through main, the real note-edit API, the manifest
     parser and every checkpoint parser/chain check. Completion and archive both land.
   - Recovery control: interrupt the request move after completion; rename the request file and target,
     add a replacement title and new source. The next run archives the same record bytes with no second
     append or completion. This control passes at HEAD.
   - Two targets: one clashed append and one target with no offered line. NOTHING_FOUND_WHY settles
     the latter in the first run. Only the clash waits; the omitted target never appends later.
   - HEAD: the request remains directly in changes; pending/<run id> is absent.
   - Retry: rename the target, source and request filename; add a replacement target with the old title,
     plus 25 unrelated retained runs and 50 archived requests. The actual retry retains the journal id
     inside the bytes and the bound target/source ids, resolves the final citation name, preserves
     personal text, completes once, and archives the exact unchanged request bytes.
   - HEAD: the retry also scans 50 archive files and 75 unrelated run records; its own run costs five
     media reads rather than the ruled one. Reads-phase calls are 146 rather than at most 16 (15 + 1).
   - Gone-target control: a binned bound target remains binned, reports ASK_GONE, archives the request,
     and gets no append/completion. This control passes at HEAD.
3. `C05 bounded reads: horizon: past 20 runs uses listing age and TOO_OLD_WHY without a chain walk`
   - Positive controls: legitimate append; a fresh request with 25 kept runs gets NOTHING_FOUND_WHY;
     an old unbound request gets TOO_OLD_WHY, no note edit/completion, and an archive move.
   - Listing creation times are AT - 2000 + i; historical manifests have requestedAt = AT.
     A request at AT - 1000 is within the listing horizon. HEAD incorrectly reports TOO_OLD_WHY.
   - A request at AT - 60000 must fail closed with the signed TOO_OLD_WHY and unchanged personal bytes.
   - HEAD preserves that outcome but walks 75 unrelated manifest/checkpoint files and reads 50 archive
     files. Both media sets must be empty.

Final targeted red run: all three tests fail on the assertions above, with no load errors.
All positive controls reached their assertions successfully. Failure evidence: `tmp-logs/bounded-red.log`.

## Rulings carried into the reds

| Ruling | Pin |
| --- | --- |
| smoke-request-slow (1), no archive scan | Golden, pending and horizon assert zero archive media reads. Hand restores are outside v1. |
| smoke-request-slow (2), pending by run id | Pending asserts the physical request move, unchanged bytes, own run selection and numeric read bound. |
| smoke-request-slow (3), listing horizon | Horizon separates listing creation from manifest requestedAt and asserts zero chain reads. |
| smoke-request-slow (4), history only for waiting | Golden runs both a new request and a pile without any waiting request against marked history. |
| smoke-request-slow (5), no migration | Golden's old-format staging variant remains new despite an existing clashed binding. |
| TL-P4-32, consent from request/target, checkpoint idempotence, fresh-note clash | Positive append, pending rename/replacement and interrupted-move recovery use main and parsed production records. |
| Addendum 1, mechanical links remain admitted | Unmodified note-edit and keep-one-note tests pass; the positive append preserves personal ownership. |
| Addendum 2, one settlement/provenance home, oldest request, independent state | Existing C05 tests stay green; new tests consume RunRecords and the existing app/runner entry points. |
| Addendum 3, target/source ids and gone target | Pending renames both ids, creates an old-title replacement, and tests a binned target. |
| Addendum 4, no second effects rather than no admission | Interrupted-move recovery asserts no second append/completion; it does not forbid admission. |
| Addendum 5, embedded record id, no title rebinding, expiry | Renamed waiting/recovery files, renamed bound targets, old-title replacements and the horizon variant. |
| Addendum 6, every named target settles; only clash carries over | Pending pairs a clashed target with a NOTHING_FOUND_WHY target and verifies the latter never appends. |

## Existing expectations for coordinator review

No existing test was changed. The following expectations may conflict with the new ruling and need red-owner
repair only after a lead/coordinator decision; they were all green at this HEAD:

- `runner/test/c05-person-notes.test.ts:390`,
  `C05 person notes: fix 1 finding 2: a conflicted append survives twenty newer runs and retries its filed source`:
  promises retry after more than twenty consecutive clashes, contrary to the accepted expiry/v1 limit.
- `runner/test/c05-person-notes.test.ts:808`, helper `round4Pending`: asserts the waiting request stays directly
  in changes. Used by `C05 person notes: round 4 2: pending retries keep target and source ids`
  and `C05 person notes: round 5 3: a request past retention is left as written and archived without an append`.
- `runner/test/c05-person-notes.test.ts:1262`,
  `C05 person notes: round 5 5: only a clashed target retries on bound ids before archive`:
  explicitly expects the clashed request bytes directly in changes rather than pending/<run id>.
- `runner/test/c05-person-notes.test.ts:342`,
  `C05 person notes: landed append with lost answer and failed read-back resumes then replays exactly once`:
  restores an archived request by hand while its origin is retained, relying on archive/history discovery.
- `runner/test/c05-person-notes.test.ts:956`,
  `C05 person notes: round 5 1: archived completion uses the record id inside differently named bytes`:
  restores archive copies by hand after retention. That fixture is now outside supported use; its effect-only
  assertions might still pass via expiry, but archive evidence is no longer the promised mechanism.
- `runner/test/c05-person-notes.test.ts:1061`, the horizon test above also assumes fixedDrive's 1970 folder
  creation times can be ignored in favour of manifest requestedAt. It needs truthful listing-time fixtures.
- The existing corpus `c05-note-not-written-by-bower` explicitly restores an archived request on press 2.
  Its no-second-effect outcome stays covered, but that hand restore is now a documented v1 limit.

The strict one-read bound is deliberately not widened: the pending red checks at most one own-run media read
and at most baseline + 1 reads-phase calls. Existing RunRecords currently consumes five files for that origin.
If “one read” was intended as one logical RunRecords lookup rather than one Drive media read, the lead must
rule on that interpretation; the red-owning session has not changed the packet's number.
The C04 baseline is 15 at this HEAD. B1a's authorized added calls must be accounted for when it integrates,
following TL-P4-41 addendum 3; no baseline or existing golden was changed here.

## Verification

Only targeted files, every vitest invocation with `--maxWorkers=2`; output redirected under `tmp-logs/`.
Only failure output was inspected. No full check or e2e was run, per the red-session instruction.

| Gate | Result | Log |
| --- | --- | --- |
| New bounded-read file, final revision | 3 assertion reds, expected | tmp-logs/bounded-red.log |
| C05 runner files | pass | tmp-logs/c05-runner.log |
| C05 app files | pass | tmp-logs/c05-app.log |
| keep-one, state rewrite, pair ask, app answer loop | pass | tmp-logs/c05-runner-contracts.log |
| note-edit, manifest, checkpoint, state rewrite, RunRecords, Home cache | pass | tmp-logs/c05-app-contracts.log |
| tsc app | pass | tmp-logs/tsc-app.log |
| tsc node | pass | tmp-logs/tsc-node.log |
| tsc runner | pass | tmp-logs/tsc-runner.log |
| eslint touched TypeScript | pass | tmp-logs/eslint.log |

Runner C05 files: `c05-person-notes.test.ts`, `c05-incorporation.test.ts`, `c05-between.test.ts`,
`c05-marked-history.test.ts`. App C05 files: `src/data/contracts/c05-person-notes.test.ts`,
`src/data/contracts/c05-person-reports.test.ts`, `src/features/tidy/c05-person-notes.test.tsx`.

## Compatibility and method

| Fixture/format | Verdict | Evidence |
| --- | --- | --- |
| Existing stored v2 manifests/checkpoints | preserved | Every actual produced manifest/checkpoint parses and its chain verifies. Existing parser tests pass. |
| Existing personal note bytes | preserved | Author API returns the exact main-written bytes; clash/retry preserves the person's added text. |
| Bound target/source and record identity | preserved | Filename/title renames do not replace embedded request id or target/source ids. |
| Old-format staging waiting requests | new by ruling | Golden intentionally refuses inherited evidence from a direct changes file. |
| Existing corpus | unchanged | Loaded existing cases are varied in memory; no new corpus case or persistent rubric was added. |

No new corpus case means no new row is needed in `2026-10-08-p4-method-rubric-changes.md`.
The in-memory bounded-read variants agree with the method: a requested append remains sourced and personal;
absence of new evidence gets the signed row; expiry loses no personal bytes and asks for fresh consent.

removed: none (red-only delivery).
tests changed: none of the existing tests; only `runner/test/c05-bounded-reads.test.ts` was added.
left out: implementation after B1a, full check/e2e, integration and commits (coordinator-owned).

## Sources (cited without fetching; no network)

- [Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list): list metadata
  in bulk, select only the request's evidence, then read selected ids.
- [Drive parent/search queries](https://developers.google.com/workspace/drive/api/guides/search-files): folder
  containment is the discovery pointer; the journal id inside the bytes is the identity.
- [Drive partial-response fields](https://developers.google.com/workspace/drive/api/guides/fields-parameter):
  creation times belong to the metadata listing, so deriving the horizon needs no manifest media.
- Existing “index points to evidence” implementation: `VaultIndex` maps physical paths/ids, and `RunRecords.found`
  verifies originating manifests and checkpoint chains. The new reds use these homes, with no extra index/store.
