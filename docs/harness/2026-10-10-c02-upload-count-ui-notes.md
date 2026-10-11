# c02-upload-count-ui red tests

implementer: codex

Role: red-owning session only. No app code, git writes, network requests, server or e2e execution.

## Named unit cases

Each name begins with `c02-upload-count-ui: `.

- `c02-upload-count-ui: No pile left unfinished`
- `c02-upload-count-ui: 1 / 3 unfinished, full read (1)`
- `c02-upload-count-ui: 1 / 3 unfinished, full read (3)`
- `c02-upload-count-ui: A read that failed in part (1)`
- `c02-upload-count-ui: A read that failed in part (3)`
- `c02-upload-count-ui: Nothing could be checked`
- `c02-upload-count-ui: Reload while files are sending`
- `c02-upload-count-ui: Sign out while 2 things send`
- `c02-upload-count-ui: Sign out with nothing sending`
- `c02-upload-count-ui: Sign out while 1 thing sends uses the singular sentence`

Home receives the count through `vault.orphanSummary(): {count, complete}`. Full-read cases resolve the summary
while the pile read still says `Looking…`, then finish that read and require the exact singular/plural sentence
under the waiting line. Partial-read cases include an active tidy-up. Text must be a paragraph without controls,
live-region ancestry or jargon. Incomplete zero requires the exact unknown sentence and never 0.

The reload unit case remounts Home with the pending pile returned by the data source and opens its real PileScreen.
It verifies today's sending/waiting state there and no picker or dialog. Persistence itself is covered by the e2e.

Settings tests inject the real `createUploadQueue` into `makeLiveSources`. A refused upload lock holds two actual
queued files in waiting state. The queue's own `pendingCount` verifies the fixture and checks cancellation and purge.
No additional count/store is invented. The two-file case checks exact copy, first focus, Keep sending, Escape,
focus return, and the real sign-out's purge. A separate one-file case checks the singular sentence.

## Named e2e cases

For each W in 375 and 1440, `e2e/c02-orphan-count.spec.ts` contains:

- `c02-upload-count-ui: No pile left unfinished at W`
- `c02-upload-count-ui: 1 / 3 unfinished, full read (1) at W`
- `c02-upload-count-ui: 1 / 3 unfinished, full read (3) at W`
- `c02-upload-count-ui: A read that failed in part (1) at W`
- `c02-upload-count-ui: A read that failed in part (3) at W`
- `c02-upload-count-ui: Nothing could be checked at W`

For each W in 375 and 1440, `e2e/c02-upload-reload.spec.ts` contains:

- `c02-upload-count-ui: Reload while files are sending at W`
- `c02-upload-count-ui: Sign out while 2 things send at W`
- `c02-upload-count-ui: Sign out with nothing sending at W`

Both specs use `./fixtures`, which selects demo by default and fake with `E2E_SOURCE=fake`.
There are no skips. Every count case scans Home and Settings through the shared axe helper with `wcag22: true`.
The sending case additionally scans the confirmation sheet and verifies keyboard focus trapping and dismissal.
Count cases check 15 px, resolved accent-line/text-muted colors, placement, and informational-only semantics.

The count e2e fixtures intercept the source module and stub only `orphanSummary`; on demo the method is added to
that world's existing data door, and on fake the DriveVault method is replaced. The actual UI and styles run normally.
These are presentation tests; real count discovery remains in orphan-pile-count-data's existing tests.

Reload/sign-out e2e reuse qa26's upload-lock hold and qa28's read-only IndexedDB inspection.
Coordinator must verify these preconditions when running: fake keeps two records, while today's DemoWorld does not
use the persistent upload queue. Consequently the sending/reload cases may expose a missing demo fixture/data path
before reaching the UI assertions. No queue or persistence implementation was added in this test-only session.
Also, `pendingCount` currently exists on UploadQueue but is not exposed by the typed screen data doors; the unit
fixture deliberately uses the production live sources so a UI that invents its own count cannot satisfy it.

## Evidence

Final targeted unit command:

`pnpm exec vitest run --config /private/tmp/c02-upload-count-ui-vitest.mjs --configLoader native --maxWorkers=2`

Result: 26 tests, 18 passed, 8 failed on assertions. All 16 pre-existing tests passed unchanged.
Six Home cases fail because Home does not read/show the summary. Two Settings cases fail because there is no
`Sign out now?` dialog. Reload and sign-out with nothing sending already pass; they remain positive controls.

The OS-temp config preserves jsdom, React, the alias, CSS-module naming and `src/test-setup.ts`, and sets Vite's
cache directory outside the repo. It omits `harness/timer-gate-setup.ts` because that setup unconditionally writes
CPU reports to `test-results/cpu` inside the repo. New Home cases flush React/microtasks without real-time waits;
new Settings cases use fake timers. No package test/check command was used because those write repository artifacts.

- Unit log: `/tmp/c02-upload-count-ui-unit.log`.
- E2e tsc log: `/tmp/c02-upload-count-ui-e2e-tsc.log` (pass).
- App/unit tsc log: `/tmp/c02-upload-count-ui-unit-tsc.log` (pass).

E2e type-check command:

`pnpm exec tsc --ignoreConfig --noEmit --target ES2023 --lib ES2023,DOM --module ESNext --moduleResolution bundler --types node --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax e2e/c02-upload-reload.spec.ts e2e/c02-orphan-count.spec.ts`

Also ran `pnpm exec tsc -p tsconfig.app.json --incremental false` and `git diff --check`; both passed.
E2e and pnpm check were not run, as instructed; the coordinator owns those runs and commits.

## Existing assertions and contradictions

No existing assertion was changed or removed. The whole two-file targeted unit suite ran.
No contradictory existing assertion was found in these files; there is no file:line contradiction to list.

## Files

tests changed: src/features/home/Home.test.tsx: added summary/readiness and reload cases; existing assertions unchanged.
tests changed: src/features/settings/Settings.test.tsx: added real-queue sign-out cases; existing assertions unchanged.
tests changed: e2e/c02-orphan-count.spec.ts: new count presentation and WCAG 2.2 coverage at 375 and 1440.
tests changed: e2e/c02-upload-reload.spec.ts: new reload, sign-out, keyboard and WCAG 2.2 cases at 375 and 1440.

## Offline sources and reused patterns

No network research was performed, per instruction. Reused the repository's existing proven patterns:
`e2e/qa26.spec.ts`, `e2e/qa28.spec.ts`, `e2e/fixtures.ts`, `e2e/axe.ts`,
`src/data/upload-sign-out.test.ts`, `src/data/orphan-pile-count.test.ts`, and today's Home/Settings tests.

Documentation references for those standard APIs (not fetched):

- https://testing-library.com/docs/react-testing-library/api/#act
- https://playwright.dev/docs/network#modify-responses
- https://playwright.dev/docs/accessibility-testing

Left out: implementation, commits, pnpm check, e2e execution and resolution of the demo pending-upload fixture gap.


## Implementation

Status: blocked before app edits, as instructed when a committed test contradicts the spec.
The complete targeted Home/Settings suite ran: 26 tests, 18 passed, 8 expected assertion failures.
The spec says the no-unfinished-pile Inbox is exactly as today and reuses today's Add button.
Today's actual button says "Add a pile" (`src/features/home/Home.tsx:216`), with no accessible-name override.
The committed reds instead require the exact accessible name "Add". Renaming it or masking its accessible
name would change the existing Inbox outside the specified line and sheet. No test was changed.

### Every contradictory case (file:line)

- `src/features/home/Home.test.tsx:394`: `c02-upload-count-ui: No pile left unfinished` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: No pile left unfinished at 375` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: No pile left unfinished at 1440` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: 1 / 3 unfinished, full read (1) at 375` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: 1 / 3 unfinished, full read (1) at 1440` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: 1 / 3 unfinished, full read (3) at 375` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: 1 / 3 unfinished, full read (3) at 1440` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: A read that failed in part (1) at 375` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: A read that failed in part (1) at 1440` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: A read that failed in part (3) at 375` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: A read that failed in part (3) at 1440` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: Nothing could be checked at 375` requires "Add".
- `e2e/c02-orphan-count.spec.ts:61`: `c02-upload-count-ui: Nothing could be checked at 1440` requires "Add".

The unit contradiction is masked by its earlier expected summary assertion failure; the contradictory
assertion was identified by reading the entire targeted test suite. E2e was inspected, not executed.
The previously recorded demo persistence fixture gap remains unverified and is not claimed as a new contradiction.

### Scope and verification

removed: none.
removed: no app behavior, data mechanism, or store.
tests changed: none
sources/provider pass-through: none; stopped before implementation.
No git write, network request, node_modules replacement, or repository-writing test command ran.
No dev/e2e server was launched. The requested full-src suite includes a port-binding unit test; its listen
was refused by the environment (EPERM), as recorded below.
Reused the existing offline Sheet, Button and Inbox implementations when assessing the contract.
Standard dialog reference (not fetched): https://www.radix-ui.com/primitives/docs/components/dialog

Commands use the existing OS-temp Vitest config, with its cache outside the repository and CPU-report-writing
setup omitted, as recorded by the red author. The full-src config changes only the include glob in that temp config.
- Targeted reds: `/tmp/c02-upload-count-ui-implementation-red.log` (8 failed, 18 passed).
- Full src: `pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/c02-upload-count-ui-all-vitest.mjs --configLoader native`.
  Log: `/tmp/c02-upload-count-ui-implementation-src.log`.
- TypeScript: `pnpm exec tsc -p tsconfig.app.json --incremental false` passed.
  Log: `/tmp/c02-upload-count-ui-implementation-tsc.log`.
- ESLint: `pnpm exec eslint src/features/home/Home.tsx src/features/settings/Settings.tsx`.
  Log: `/tmp/c02-upload-count-ui-implementation-eslint.log`.
- pnpm check omitted: its test/build/report commands write into the repository, contrary to this task's constraint.
- E2e/axe omitted: coordinator owns the server and these runs; port binding is forbidden here.
- Commits omitted: every git write is forbidden here.


### Final verification results

Full src completed: 167 files, 5,585 tests; 163 files passed, 5,575 tests passed, 10 failed, 1 unhandled error.
Eight failures are the committed UI reds recorded above. The other two are unchanged baseline/environment issues:
- `src/docs.test.ts:134`: `every change since the P2 freeze is listed`; commit `59d4dfbb` missing from the list.
- `src/e2e-port.test.ts:37`: `a server from another worktree is never reused`; timed out after listen was denied.
  Unhandled error: `listen EPERM: operation not permitted 127.0.0.1`. No port was successfully bound.
These two are not spec contradictions and were not modified; neither owned file can resolve them.
TypeScript and ESLint both passed (exit 0, empty OS-temp logs). Only this notes file differs in the worktree.
Required next step: resolve the committed Add/Add-a-pile contract contradiction before implementation resumes.

## Red repair 1

tests changed: src/features/home/Home.test.tsx: the spec reuses today's "Add a pile" button
tests changed: e2e/c02-orphan-count.spec.ts: the spec reuses today's "Add a pile" button

Changed only the accessible name in the one Home assertion and the shared assertion for all 12 e2e cases.
No other assertions or app code changed. No git writes, network requests, port binding or node_modules changes.

Verification: `pnpm exec vitest run --config /private/tmp/c02-upload-count-ui-vitest.mjs --configLoader native --maxWorkers=2`
ran Home.test.tsx and Settings.test.tsx: 26 tests, 18 passed, only the 8 expected behaviour reds failed
(6 Home summary cases and 2 Settings sign-out sheet cases). Log: `/tmp/c02-red-repair-unit.log`.
The Add assertion remains behind the expected missing-summary failure in the no-unfinished-pile unit case.
E2e spec tsc passed (exit 0): `pnpm exec tsc --ignoreConfig --noEmit --target ES2023 --lib ES2023,DOM --module ESNext --moduleResolution bundler --types node --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax e2e/c02-orphan-count.spec.ts`.
Log: `/tmp/c02-red-repair-tsc.log`. `git diff --check` passed.
pnpm check and e2e execution omitted under the explicit repository-write and port-binding constraints.

## Implementation

Implemented U1–U3 after the committed Red repair 1. No remaining test/spec contradiction was found.

Home reads `vault.orphanSummary` through today's `useLoad` and vault subscription. Its helper chooses the
singular/plural, incomplete and unknown sentences outside JSX. The static paragraph sits under `inboxSub`,
waits for both the summary and Inbox readiness, remains visible during tidying, and uses 15 px with
`--accent-line` or today's muted class. Zero complete leaves today's Inbox and Add a pile unchanged.

Settings reads the queue's own pending count at the Sign out press. Today's Sheet and Button provide the
confirmation, first focus on Keep sending, Escape dismissal, focus trap and focus restoration. Confirming
calls today's sign-out and its purge; a zero count calls it directly. Today's failure sentence remains.
The sheet's React state is the presentation snapshot, not a second upload store or a recomputed count.

### Owned files and strictly needed pass-through

- `src/features/home/Home.tsx`
- `src/features/home/home.module.css`
- `src/features/settings/Settings.tsx`
- `src/data/sources.ts`: optional `VaultSource.pendingUploadCount` screen door.
- `src/data/live/index.ts`: direct forwarding to the existing queue's `pendingCount`, on the stable vault door.
  No provider change, queue change, count computation or additional production store.
- `src/data/demo/world.ts`: the explicitly authorized demo fixture gap, described below.
- This notes file only; committed tests are unchanged.

### Demo pending-upload fixture gap

The spec's sending/reload and sign-out rows need two actual persistent pending records on demo as well as fake.
Demo file bodies now enter the existing `createUploadQueue`, over today's IndexedDB store and Web Locks,
with a made-up FakeDrive destination. Account/folder identities isolate demo scenarios from the fake source.
Pile text rides with existing queue metadata so the pending pile can be shown after reload; no new persistence
store or schema is added. The queue owns pending bytes and state; demo paragraphs never calculate a count.
The existing demo pile array keeps only item metadata, with no extra copy of file bodies.

Reload projects those queue members into today's pile rows and preserves the queue's storage-fallback notice.
Demo sign-out/deletion calls the queue's existing forget path before today's session changes; purge failure
reports a BowerError and keeps the person signed in. Disposal stops the queue. Removing a pending pile discards
its queue members; retry uses the existing queue retry. Completed members do not resurrect a filed/removed pile.
Completed demo content otherwise keeps today's in-memory demo behavior. This fixture is demo-only;
no real/fake persistence, queue implementation, declarations or production upload behavior was changed.

removed: the demo pile array's accidental retained copy of file body/url input fields.
removed: none of today's Inbox controls, sign-out purge, focus behavior or storage-fallback sentences.
tests changed: none

### Offline standard solution and reuse

No network was used. Inspected today's `src/ui/Sheet.tsx` (Radix Dialog), Button, Inbox,
`src/data/upload-queue.ts`, upload store and live data doors. Reused those mechanisms.
The upload store cites the original app's `app/src/cache.ts` as its adaptation source.
Standard references, cited without a network fetch:
- https://www.radix-ui.com/primitives/docs/components/dialog
- https://github.com/deluispablo/bower

### Verification

All outputs and Vite caches went to OS temp. The previously supplied OS-temp Vitest configs preserve the
app's React/jsdom/alias setup and omit only the repository-writing CPU report setup, as documented above.
No test, node_modules, git state, server, port or network configuration was changed.

- Unit reds before edits: 8 failed assertions, 18 passed; `/tmp/c02-ui-red.log`.
- All named unit reds after edits: 26 passed; `/tmp/c02-ui-green.log`.
- Final Home/Settings/demo unit verification: 61 passed; `/tmp/c02-ui-final-unit.log`.
- `pnpm exec tsc -p tsconfig.app.json --incremental false`: pass; `/tmp/c02-ui-tsc.log`.
- ESLint on all touched TypeScript files: pass; `/tmp/c02-ui-eslint.log`.
- `git diff --check`: pass (read-only).
- Full requested src suite: `/tmp/c02-ui-src.log`; final result recorded below.
- pnpm check not run: it writes repository artifacts, prohibited in this assignment.
- E2e/axe not run: coordinator owns those runs; this environment cannot bind ports.
- Commits not made: all git writes are prohibited in this assignment.

### Final full-src evidence

Command: `pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/c02-upload-count-ui-all-vitest.mjs --configLoader native`.
Result: 167 files; 164 passed, 3 failed. 5,585 tests; 5,581 passed, 4 failed; one unhandled error.
All UI reds passed. Failures outside this implementation's owned code:
- `src/docs.test.ts:134`: `every change since the P2 freeze is listed`; commit `0b299ffd` is absent from the list.
- `src/e2e-port.test.ts:37`: `a server from another worktree is never reused`; listen was denied with EPERM,
  followed by the test timeout and one unhandled error. No port was successfully bound.
- `src/data/vault/undo-compensate.property.test.ts:737`: random batch 4 and random batch 5 exceeded the existing
  5,000 ms timeout under the full suite. Neither asserts a contradiction with this UI spec.

Reran only the two timed-out cases, with the same config, worker limit and original timeout:
`pnpm exec vitest run src/data/vault/undo-compensate.property.test.ts --testNamePattern 'random batch (4|5)\)' --maxWorkers=2 --config /private/tmp/c02-upload-count-ui-all-vitest.mjs --configLoader native`.
Both passed (2 passed; 34 filtered by the command), `/tmp/c02-ui-property-rerun.log`.
No timeout, seed, bound, test assertion or fixture was changed.

Final code also passed the 61 Home/Settings/demo tests, tsc, touched-file eslint and read-only diff whitespace check.
Coordinator still owns pnpm check, demo/fake e2e and axe, and commits. The full-src command is not claimed green.
tests changed: none

## Fix round 1

The coordinator reports four fake failures in `e2e/c02-upload-reload.spec.ts:97`: both widths (375 and 1440)
in both phone and desktop projects. Pending records reach zero, but Continue with Google never shows;
only Demo situations remains. Demo e2e and pnpm check were green before this round. The fake no-upload
sign-out control passes. These are supplied browser reds; no browser/server was started in this round.

### Diagnosis and smallest fix

The sheet confirmation previously called `setSending(0); signOut();` in the same click. Closing Sheet
starts an asynchronous `history.back()` through `useBackCloses` (`src/ui/back.ts:36` and its effect cleanup).
`LiveSession.signOut` emits the signed-out session before the wrapper finishes queue cleanup
(`src/data/live/session.ts:86`; `src/data/live/index.ts:377`). Gatekeeper consequently redirects from
Settings to `/sign-in` (`src/app/App.tsx:133` and `ToSignIn` at 192) while the sheet's history entry can
still be active. Its late back can undo that redirect. This ordering race fits the empty routed content,
the zero kept count, the faster fake session and the passing no-sheet control.

`src/features/settings/Settings.tsx:188` now reuses this screen's existing Delete-account ordering:
close the sheet, give React the zero-delay turn to run its cleanup, await `afterOverlaysClosed`, then
invoke the existing sign-out helper. The signed-out route is entered only after the overlay's own
history back has landed. The no-upload direct sign-out path and the sign-out helper's error handling stay.
No new history, upload, count or persistence mechanism is introduced.

The count pass-through is sound: `VaultSource.pendingUploadCount` is the optional door in
`src/data/sources.ts:53`; the stable live door's own method forwards directly to `queue.pendingCount`
(`src/data/live/index.ts:408`). The door's proxy expressly returns own method overrides without resolving
the folder or dispatching to a new lifetime (`src/data/live/index.ts:223`). It creates no additional wait.

### Held-lock evidence; no impossible-wait contradiction

`e2e/c02-upload-reload.spec.ts:7–18` returns null for the ifAvailable probe and a never-settling promise
for a blocking upload-lock request; it also ignores that request's AbortSignal. This is artificial,
but it does not block the sign-out wait in this case:

- `src/data/upload-queue.ts:670–686`: `waitForTurn` launches the blocking request without awaiting it.
- `src/data/upload-queue.ts:690–708`: `acquire` resolves its own boolean from the ifAvailable callback;
  the fixture runs that callback with null immediately.
- `src/data/upload-queue.ts:837–909`: `add` tracks staging through store work and returns after admission;
  sending runs through `void pump()`. The lock wait is not a staging operation.
- `src/data/upload-queue.ts:975–990`: `forgetAccount` clears the store and awaits stage.done, including
  late-write cleanup and its failures. It does not await the blocking request or transfer-lock ownership.
- `src/data/upload-queue.ts:712–726`: `stop` aborts the wait, fences generations and clears entries.
- `src/data/live/index.ts:362–369,377–385`: sign-out still awaits `forgetAccount` and reports purge failures.

The staging/cleanup guarantee (addenda 9–12) is preserved. There is no test/contract contradiction requiring
the lock fixture to be changed. None of the four reported failures is dismissed as an impossible wait.

removed: the sheet confirmation's immediate sign-out before overlay history cleanup.
removed: none of the staging wait, cleanup wait, purge, count door, or signed-out UI behavior.
tests changed: none

### Offline reuse and verification

Reused Settings' existing account-deletion pattern and `src/ui/back.ts:32` as the standard local navigation
mechanism. Sheet uses the existing Radix Dialog. Reference (not fetched; network forbidden):
https://www.radix-ui.com/primitives/docs/components/dialog

No git write, test edit, node_modules replacement/symlink, network request or server launch was performed.
The existing OS-temp Vitest config was reused: React/jsdom/aliases unchanged, cache in OS temp, and the
repository-writing CPU report setup omitted. All logs go to OS temp. The full-src command includes the
existing port-binding unit test; the environment denies its listen, as in the previous run.

- Before the fix, existing Settings unit cases: 4 passed; `/tmp/c02-fix1-before.log`.
  These MemoryRouter tests do not assert the BrowserRouter signed-out route after history cleanup.
- Full src: `pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/c02-upload-count-ui-all-vitest.mjs --configLoader native`.
  Log: `/tmp/c02-fix1-src.log`; final results appended below.
- TypeScript: `pnpm exec tsc -p tsconfig.app.json --incremental false`: passed; `/tmp/c02-fix1-tsc.log`.
- Touched-file ESLint: `pnpm exec eslint src/features/settings/Settings.tsx`: passed; `/tmp/c02-fix1-eslint.log`.
- pnpm check/e2e/axe: coordinator reruns these; repository-writing checks and server/port use are unavailable here.
- Commits: none; all git writes forbidden. Changed files: Settings.tsx and this notes file.

### Final results and blocking unit timing contract

Full src completed: 167 files, 165 passed, 2 failed; 5,590 tests, 5,588 passed, 2 failed, one unhandled error.
Failures:
- `src/e2e-port.test.ts:37`: the unchanged port-identity case times out after `listen EPERM`;
  the unhandled error is the same forbidden listen. No port was successfully bound.
- `src/features/settings/Settings.test.tsx:89`: `c02-upload-count-ui: Sign out while 2 things send`
  expects the signOut spy once after a single zero-time flush, but the corrected path is still waiting
  for overlay history cleanup. This is a new failure from the necessary ordering change.

Reran the whole Settings suite without changing any test: 3 passed, this one failed on the same assertion;
`/tmp/c02-fix1-settings.log`. The four supplied fake browser reds remain unverified locally.
TypeScript, touched-file ESLint and `git diff --check` passed. The full-src suite is not green.

Every contradictory targeted case: `src/features/settings/Settings.test.tsx:89`, the two-file sign-out case.
Its fixture uses fake timers (`:29`) and defines settle as only `vi.advanceTimersByTimeAsync(0)` (`:30`).
It closes the first sheet with Keep sending at `:74`, then uses that zero flush at `:75`; Escape and
confirmation also use the same flush. History is real jsdom history even though routing is MemoryRouter.
The first close can leave the module's selfBacks promise unsettled across the later sheet presses.

Installed-library evidence, read offline:
- jsdom `lib/jsdom/living/window/SessionHistory.js:42–69` queues a task inside another task before traversal.
- jsdom `lib/jsdom/living/nodes/Document-impl.js:641–654` implements each task with setImmediate.
- Vitest `dist/chunks/index.C4tKZ0yW.js:4961` schedules an immediate created during a fake-clock tick
  at clock.now + 1. A zero-only flush therefore cannot reach that nested traversal/popstate.
- `src/ui/back.ts:23–29,32–33` resolves afterOverlaysClosed only when that popstate lands.

This is a unit scheduling conflict with awaiting the existing overlay mechanism, not an upload-lock
or staging-cleanup impossibility. The zero-time assertion previously passed because sign-out did not
wait for history, which is precisely the browser race being fixed. No fake-timer duration or assertion
was weakened, and no special production branch for a test router was added.

Status: blocked on this unit timing contract. The minimal Settings fix remains in the working tree for
review; the coordinator/lead must rule on the unit fixture, then rerun the four fake browser cases and
the integration gates. No additional app change can make an awaited real popstate arrive during the
fixture's zero-only clock advance without bypassing the existing history mechanism.
removed: none of the existing tests or their assertions.
tests changed: none


## Red repair 2

tests changed: src/features/settings/Settings.test.tsx: waits for overlay cleanup like Delete my account

No Delete-account test exists in this file. Only the two-file sign-out case now advances fake time
by 10 ms at its existing waits, allowing jsdom's nested setImmediate history traversal to finish.
All expectations are unchanged, including exactly one sign-out after confirmation and none after
Keep sending or Escape. Settings.tsx's retained ordering fix is untouched.
Offline reuse: the nested jsdom/fake-clock scheduling evidence in Fix round 1 above.

Verification: `pnpm exec vitest run src/features/settings/Settings.test.tsx --config /private/tmp/c02-upload-count-ui-vitest.mjs --configLoader native --maxWorkers=2`
passed: 1 file, all 4 tests. Log: `/tmp/c02-red-repair2-settings.log`. `git diff --check` passed.
The existing OS-temp config keeps caches outside the repository and omits the CPU-report-writing setup.
No git writes, network requests, port binding or node_modules changes. pnpm check/e2e omitted under
the explicit repository-write and port restrictions; coordinator owns commits and integration gates.

## Close (coordinator, 2026-10-11)

known-green: the 8 behaviour reds were proved failing at the tests-only commits 59d4dfbb/46f07c59 (repaired 0b299ffd) before ab3f9b32 (notes "Implementation", 8 failed / 18 passed) and pass at HEAD; fix 1 (5c84961f) then touched the same Settings lines, so done.sh cannot revert ab3f9b32 alone, and 5c84961f alone is pinned only by the fake e2e (c02-upload-reload :97, 4 failures before it, green after). P4-106 PASS; designer verified at e9033cfd; check green; e2e demo 71 / fake 95.
