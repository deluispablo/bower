# Packet: P4-50b delta review (c4-app-fence fix round, TL-P4-24 addendum 6)

This review is read-only and fresh.
- Run unit and contract tests only. Never start a server, run e2e or call the claude CLI.
- Never check out the main repo in any form.
- Run git with `-C /private/tmp/bower-c4-fence`.

## What to review

- **Delta:** `git diff f772b9ce..f47217e5`. Red 76f37dfc, fix b829a69a, notes f47217e5.
- **Contract:** `docs/harness/2026-10-09-c4-app-fence-round2-packet.md`.
- **Findings it fixes:** `docs/harness/2026-10-09-codex-c4-app-fence-review.md` (3 Important), plus the P4-50 minors.

## Look hardest at

- **The landed check lives in the one helper.** `checkStillAsSeen` takes an optional `landed(now)`, evaluated before `notAsSeen`. Every app fence passes its intent's write-once landed test: for a rename, the target name and place plus the stamp; for text, `holds`, empty text included.
- **No precheck refuses first.** `:1747` (restore) and `:1066` (updatePile rename) go through the helper. Look for any other path where a stale-read refusal still comes before the landed test.
- **The landed predicate must not let a real outside change through.** If someone else renamed the file to the same target, does the stamp still prevent a false "landed"?
- **The gap rows** (`:1030` 404, `:1708`, `:467`, `:1544`) and the Undo lost-answer test exist. The worker says they pass before the fix: check they are real guards, not empty ones.
- **CHANGED_ELSEWHERE** is used at journal.ts:509.
- **SeenFiles:** the worker says `SeenFiles.read` keeps `readForFence`. The contract says SeenFiles calls the one helper, or the card says why it cannot. Judge whether this is one home.
- **The goldens** do not rise. The `tests changed:` lines are present. No `.only` or `.skip`.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
