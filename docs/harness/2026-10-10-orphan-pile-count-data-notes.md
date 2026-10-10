# orphan-pile-count-data red delivery

implementer: codex

Role: independent red-owning session only (TL-P4-29). Base HEAD:
`e910ddce7269718976aadbd67afd9f22643e5788`, branch `orphan-pile-count-data`.
Only the new test file and this notes file were written, plus requested logs under `tmp-logs/`.
No app code, existing test, contract, runner file, or harness state was changed.
No network, server, e2e, full-suite command, or git-writing command was used.
Coordinator owns the separate red and notes commits.

## API seam and evidence limit

The packet, prep section 5, and TL-P4-53 rule an app-local summary with a known count and completeness,
but do not freeze a concrete method name or field names. This file provisionally uses
`VaultSource.orphanSummary(): Promise<{ count: number; complete: boolean }>`.
The seam is isolated in `summary()` so the lead can rule its spelling without changing contract numbers.
No summary stub, alternative scanner, or production implementation was added.

At HEAD, all eleven reds fail the explicit assertion:
`VaultSource.orphanSummary must expose the cached count and completeness`:
expected type `function`, received `undefined`.
Both fast-check failures have this same AssertionError as their cause.
This is the missing-capability red allowed by the requested missing-export assertion helper;
it is not evidence that eleven independent value-level failures have already been observed.
The value assertions become reachable when the approved summary capability exists.
There are no import/load errors, fixture assertion failures, timer-gate failures, or unhandled rejections.

## Reds

Every exact expanded name is below. All share the HEAD failure reason above.

1. `orphan-pile-count-data: orphan folder declaration remains countable after anchor creation fails`
   - Pins `{ count: 1, complete: true }` after a declaration commits but its folder create fails.
   - Positive controls: actual `addPile` makes a discoverable anchored context pile; the failed add leaves
     one parser-valid folder declaration with two members and no matching anchor.
   - Reload uses a fresh `DriveVault`. Summary must neither create a folder nor mutate Drive.
2. `orphan-pile-count-data: orphan count merges queued loose work and copied declarations once`
   - Pins one orphan from a queued loose member and two identical declaration copies.
   - Real `addPile`, real upload queue, fake IndexedDB, injected queue clock, and two transfer barriers.
     Stop/dispose and a fresh queue/vault model reload over the same retained bytes.
   - Positive controls: IndexedDB holds the original bytes; the fresh vault lists the loose work once;
     a real anchored control with two absent members keeps `setAside: 'not-arrived'` and contributes zero.
3. `orphan-pile-count-data: orphan count cannot retire unresolved work from disposition stamp alone (damaged)`
4. `orphan-pile-count-data: orphan count cannot retire unresolved work from disposition stamp alone (unrelated)`
5. `orphan-pile-count-data: orphan count cannot retire unresolved work from disposition stamp alone (mismatched-hash)`
   - Damaged and mismatched-hash cases use a loose declaration from an actual failed upload;
     the unrelated case uses an actual failed folder creation.
   - A matching listing stamp cannot yield complete zero: unresolved work remains counted or completeness is false.
   - Positive controls: canonical, parser-valid consumed disposition; identical declaration copies;
     foreign-root declaration; mismatched declaration digest; eventual valid consumption gives count zero.
     The damaged copy may continue to make completeness unknown after work is consumed.
6. `orphan-pile-count-data: orphan count reports an unchecked candidate as unknown`
   - Pins `{ count: 0, complete: false }` during an injected retryable read refusal, then
     `{ count: 1, complete: true }` after refresh/retry.
   - Positive controls before the red: the saved loose declaration parses; the real full read reaches
     the exact-id barrier and logs the injected BowerError. No filename matching or timed wait.
7. `orphan-pile-count-data: summary shares the full-read cache and refresh invalidation`
   - Full read, concurrent summaries, and another full read share one listing and one declaration read.
     A removed declaration stays in the cached snapshot until the existing refresh notifies subscribers;
     the next summary becomes complete zero.
   - Positive control: the committed declaration parses with exactly two members.
8. `orphan-pile-count-data: ambiguous context-only history is unknown and intentional removal is retired`
   - Pins unknown completeness when only a context-only declaration survives a vanished anchor,
     with no member, Bin, or removal evidence.
   - Positive controls: the context pile is initially anchored and discoverable; a separate root's
     deliberate `removePile` leaves no live declaration or pile and yields complete zero.
9. `orphan-pile-count-data: a matching anchor moved within the root is excluded without recreation`
   - Pins one orphan from unresolved work while a matching context anchor moved to Areas contributes zero.
   - Positive controls: real `addPile` and `move`, identity retained by id, no longer in Inbox.
     Reading the summary must leave the complete Drive snapshot unchanged.
10. `orphan-pile-count-data: generated orphan counts dedupe declarations and exclude foreign roots`
    - fast-check: seed `531001`, 12 runs, pile counts 1–4, identical copies 1–4, member counts 2–5.
      Every pile comes from actual failed `addPile` folder creation; records use the existing canonical helper.
    - Positive control: current-root copy multiplicity equals `count * copies`.
    - HEAD counterexample: `[2,4,5]`, path `0`; the underlying failure is the missing API assertion.
11. `orphan-pile-count-data: generated unreadable or conflicting evidence never becomes a complete zero`
    - fast-check: seed `531002`, 12 runs, identical copies 1–4, unreadable/conflicting variants.
      One known orphan survives beside uncertain evidence: `{ count: 1, complete: false }`.
    - Positive control: known declaration copies have the generated multiplicity.
    - HEAD counterexample: `[2,false]`, path `0`; the underlying failure is the missing API assertion.

Both properties use `endOnFailure: true`; HEAD stops at the first generated counterexample.
No generator bound, expected count, or tolerance was loosened to obtain a result.

## Preservation and contradictions

tests changed: none (all pre-existing assertions preserved byte-for-byte).
removed: none.
Contradicting existing count assertions found: none. The existing loose discovery tests deliberately
omit folder declarations and skip stamped dispositions (`src/data/pile-records.test.ts:60`,
`src/data/pile-records.test.ts:74`; `src/data/pile-readiness.test.ts:75`, `src/data/pile-readiness.test.ts:82`).
Those assert the existing discovery helper's return/read behavior, not the new summary's count or completeness;
this delivery preserves them and does not claim that loosening them is authorized.
Likewise `src/data/vault/drive-vault.test.ts:2134`, `src/data/vault/drive-vault.test.ts:2150`
keep a vanished folder out of `piles()`; counting its unresolved declaration in a separate summary does not
require changing those assertions. Only the newly assigned file was run, as explicitly requested.

## Verification

- `pnpm exec vitest run src/data/orphan-pile-count.test.ts --maxWorkers=2`
  exited 1: 1 test file, 11 tests, 11 expected assertion reds at the unchanged HEAD.
  Log: `tmp-logs/orphan-pile-count-red.log`.
- `pnpm exec tsc -p tsconfig.app.json --noEmit` exited 0.
  Log: `tmp-logs/orphan-pile-count-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit` exited 0.
  Log: `tmp-logs/orphan-pile-count-tsc-node.log`.
- `pnpm exec eslint src/data/orphan-pile-count.test.ts` exited 0.
  Log: `tmp-logs/orphan-pile-count-eslint.log`.
- Only failure patterns and aggregate result lines were read from test output.
  An initial ESLint non-null assertion was removed; final typecheck and lint both pass.
- `pnpm check` and e2e were not run: this session was explicitly restricted to the new red test file,
  app/node TypeScript, and touched-file ESLint. Production and UI implementation are left to their assigned sessions.

## Standard solution and sources

No network research was performed. The protocol reference is inherited from the packet's prep,
and the durability behavior is checked against the existing in-worktree store transaction completion code.

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI, query status using `Content-Range: bytes */N`, handle 308 with the server offset,
  and restart expired sessions using the same reserved identity. These reds reuse the real queue, without
  changing or duplicating the existing resumable protocol.
- [IndexedDB transaction model](https://www.w3.org/TR/IndexedDB/#transaction-concept): transaction completion
  is the staging boundary, and browser storage does not itself guarantee permanent retention.
  The queue/store test uses actual fake IndexedDB transactions rather than a substitute pending table.

Left out: production summary implementation, a lead ruling on the provisional API spelling,
upload staging/sign-out fixes, UI/copy, integration, full gates, and coordinator-owned commits.
