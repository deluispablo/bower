# Packet: c4-app-fence round 3 (TL-P4-24 addendum 7, main 03313860)

- **Entry:** `c4-app-fence`, escalated. It runs on a fresh Opus session (`bower-escalated`), since fix rounds are fresh sessions. Worktree `/private/tmp/bower-c4-fence`, branch `c4-app-fence` (at f47217e5). Merge `claude/p3` first.
- **Ruling sweep:**
  - TL-P4-24 addenda 4, 6 and 7;
  - the Codex delta pass in `docs/harness/2026-10-09-codex-c4-app-fence-review.md` ("Delta pass", 2 Important);
  - the P4-50b card's minors (accepted, except the helper's signature);
  - the round-2 packet `2026-10-09-c4-app-fence-round2-packet.md`.
- **Summary of rounds 1 and 2:**
  - Round 1: one helper, `checkStillAsSeen` in `contracts/still-as-seen.ts`, fences every app write of an existing file through `byId`.
  - Round 2: it gained an optional `landed(now)` predicate, evaluated before `notAsSeen`, so a write that already landed (its answer lost) resolves.
  - The Codex delta pass found that `landed` is too loose (finding 2), and that restore trusts a cached state across presses (finding 1).

## Contract

1. **What "landed" means.** The file is now exactly what this write would have made it:
   - the write-once stamp and checksum, **and**
   - `notAsSeen(expectedAfter, now) === null`, ignoring modifiedTime (the write itself changes it).
2. **`expectedAfter`** is what the write read, with the write's own change applied:
   - rename or move: the target name and place;
   - Bin: trashed true;
   - Unbin: trashed false;
   - text: the name, place and trashed false it read.
3. **One definition.** The helper builds `expectedAfter` once, from the intent. No call site states its own.
   - This covers finding 2 (`:1089`: an empty text write's landed check now needs the note still in the pile).
   - It also covers P4-50b's minor: a landed 'bin' is no longer accepted for an edit with words.
4. **No cached state decides that a step is done** (finding 1, `:471`). The one fence decides every step of a retry on a fresh read. `gone.back` may keep the chosen name, never the file's state.
5. **`checkStillAsSeen` keeps one async signature.** No sync/async overload and no `instanceof Promise`. If SeenFiles' FakeDrive step needs a sync path, say on the card how it is handled without a second entry point.
6. **The other P4-50b minors are accepted as they are.**

## Red

- One red per finding:
  - `a restore retried after an outside Bin does not report success while the file is in the Bin` (finding 1);
  - `an emptied pile note that landed and then moved elsewhere is refused on retry` (finding 2).
- **Class test: the fast-check trial (TL-P4-20) starts here.** One property in `src/data/vault/drive-vault.test.ts`, or a sibling file named on the card. It covers:
  - every app write intent: text (empty included), rename, move, Bin, unbin, restore, removePile and Undo;
  - every interleaving of a lost answer with an outside move, rename or Bin.
- **What the property asserts:**
  - a retry reports success only when the file is in the intended final state;
  - it never writes over a file that changed.
- Use a seeded, bounded run (`numRuns`, a fixed `seed`) so it stays deterministic and fast. Put the seed in the test.
- **The dependency.** `fast-check` is not installed. Add it as a devDependency, pinned to an exact version at least two weeks old. Research the current stable version first and cite it. The lockfile is updated, and `pnpm audit` stays clean. Say on the card that the dependency was added.

## Verify

- The reds and the property, plus every verify from rounds 1 and 2.
- e2e qa9, qa10 and capabilities on fake, phone and desktop.
- `pnpm check`, run through `bash harness/with-lock.sh`.
- The goldens do not rise.

## Commits

1. The red: the tests, plus the devDependency and lockfile.
2. The fix.
3. A notes addendum ("Fix round 3 (addendum 7)") with compatibility rows and `tests changed:` lines.

Then a Claude delta re-review and a Codex pass on the delta.
