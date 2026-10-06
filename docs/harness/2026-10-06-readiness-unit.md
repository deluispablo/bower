# partial-pile-readiness: declared folder piles stay visible until ready

Prepared by the integration coordinator (Claude, `claude-orchestrator-2026-10-06-e759b272`) under contracts-2 / main `10ca886`, TL-P2-2026-10-05-03 (readiness direction: immutable declarations in `.bower/piles`, effect-derived readiness, consumer before producer) and TL-P2-04 (ratified B declaration). Entry `partial-pile-readiness` (qa-13), already registered with its unchanged verify. Design source: Claude planner report (read-only) summarised below; provisional rulings 1–6 sent to the technical lead for TL-P2-06.

## Assignment

- Implementer: Claude subagent `readiness-impl-1`. Checkout `/private/tmp/bower-p2-readiness`, branch `claude/p2-readiness`, base = integration HEAD at dispatch (recorded in ACTIVE). Evidence `/private/tmp/bower-p2-readiness-evidence/`.
- Writable: NEW `src/data/pile-readiness.ts` (+ optional `pile-readiness.test.ts`), `src/data/vault/layout.ts`, `src/data/vault/drive-vault.ts`, `src/data/vault/drive-vault.test.ts`, `src/data/fake/fake-runner.ts`, `src/data/fake/fake-runner.test.ts`.
- Read-only: `fake-worker.ts`, `fake-drive.ts`, `pretend.ts`, `choose.ts`, `live/*`, `types.ts`, `sources.ts`, `contracts/*`, fixtures, config. Serialized before `run-report-save-barrier` (both own `fake-runner.ts`).
- Verify (unchanged): `pnpm vitest run src/data/fake/fake-runner.test.ts -t "an incomplete pile retains every member across tidy-up and retry"`.

## Behavior

- **Readiness module** (`pile-readiness.ts`, no own I/O): discover declarations by real parent IDs (`.bower` → `piles` → `declaration-<declarationId>-<sha256>.json`), parse with integrated `parsePileDeclaration(bytes, rootId)`, check filename hash, collapse identical copies, refuse differing copies as conflict. Member state per key: missing (no child with `bowerItem` = key), conflict (>1), unverified (size/sha256 mismatch or read error), verified. Ready only when every member verified and a declared context file exists (its text may have been edited).
- **Producer** (`addPile`, folder layout only, behind `DriveVaultOptions.declarePiles`, default false): hash members → mint `pileId`, `declarationId`, folder `createKey`, context key, member keys → write canonical declaration into `.bower/piles` → only then create the folder with `{pile, bowerDeclaration}` → Pile note with its key → uploads keyed by memberKey. A failed declaration write uploads nothing. Loose layout unchanged (deferred).
- **Consumer `piles()`** (always on): for a live Inbox folder with `bowerDeclaration`, add a row `{id: memberKey, name, kind, origin, upload: -1}` for each declared member with no child and no local upload. Unmarked piles unchanged. Rows show only while the folder is live; hiding is not retirement.
- **`retryPile`** without local bytes but with declared missing rows: `BowerError('conflict', 'Choose <name> again on this device to send it.')`, zero uploads. Original uploader retry unchanged (only the failed key, never resend completed siblings).
- **Fake runner**: compute readiness for marked piles from `drive.readBytes` + sha256 (`fake-stored`). Unready marked piles: not taken, not filed, not Binned, not counted; named in `report.setAside` with `Some of its things have not arrived yet.` Ready marked piles move only verified members; before Bin, relist the folder and keep it if any uncaptured live child remains. Unmarked piles exactly as today.

## Evidence

Test-first through public APIs only (no missing-import reds): scenarios under `describe('an incomplete pile retains every member across tidy-up and retry')` — second client lists the declared missing member; tidy-up keeps an unready pile and names it set aside (no move/Bin, bytes unchanged); a client without bytes is asked to choose the file again; retry then tidy-up files each member once and Bins once, declaration unchanged; a child added to a ready pile keeps its folder; an unmarked pile is filed as before. In `drive-vault.test.ts` `describe('pile declarations')`: declaration written before any member and never rewritten; failed declaration write uploads nothing; uploader shows each missing member once; conflicting declaration copy blocks the pile. Existing tests stay green unchanged.

Commit tests first, capture genuine red, ONE fix commit, verify + full `pnpm check` (+ `pnpm e2e` and `pnpm e2e:fake` are NOT run by the worker: browser gates are serialized by the coordinator). Do not claim real upload retention/D02 reselection, R4 create uniqueness, disposition retirement, browser/real-runner admission, fixtures 07/09 in full, or exactly-once beyond counted fake effects.

## TL-P2-06 amendments (Planificador, 2026-10-06)

- (1) Rows show only while the folder is live; hiding does not retire. Follow-up entry registered for a declared pile whose folder disappeared other than through the person's Bin.
- (2) Loose layout (fixture 07) deferred as its own registered P2 entry, not a P2 limit.
- (3) Done with setAside on the legacy path; blocked piles untouched: no move, Bin, disposition or Timeline, never counted consumed.
- (4) Uncaptured-child Bin guard applies to EVERY pile folder, declared or not: Bin only if current children ⊆ captured children.
- (5) Producer on in tests, `?source=fake` (pretend) and demo if it uses DriveVault; off for the real source until the P3 runner consumes declarations (P3 obligation). Scope widened to the fake/demo factory wiring (`pretend.ts`/`choose.ts`) for that option only.
- (6) Blocked piles: assert every byte, name and place of members, folder and context unchanged.
- Copy approved; D02 reselection registered as its own entry.
