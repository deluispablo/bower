# Packet: compatibility-accepted-app (P3-18)

Starting model: `bower-implementer` (Sonnet), per [TL-P3-25](2026-10-07-tl-p3-25-pile-notes-and-the-last-p3-e-entries.md) point 4. The P2 app was accepted at its freeze. Everything it writes must still read the same through the P3 shared core and the runner. Every change since then to its features and contracts must be tied to an entry.

- **Entry:** `compatibility-accepted-app`. Checkout `/private/tmp/bower-p3-compat`, branch `claude/p3-compat`, from the commit named in your prompt. Never push or deploy.
- **Read:**
  - `docs/harness/WORKER.md` and this packet;
  - `src/data/contracts/` (every module), `src/data/vault/layout.ts` and `src/data/vault/journal.ts`;
  - `src/docs.test.ts`;
  - `git log --oneline 00ec9a5..HEAD -- src/features src/data/contracts`, plus `harness/features.json` queried with `jq` to map commits to entries. Never read the whole file.
- **Acceptance contract:**
  - **Fixtures.**
    - Put them in `src/data/contracts/fixtures/p2/`, one JSON (or `.md` for a journal line) per shape the P2 app writes. Cover:
      - `last-run.json`, `questions.json`, `suggestions.json`, `requests.json`, `hashes.json`;
      - pile records, run manifest, run checkpoint, run report;
      - pile declaration and pile disposition;
      - one file per journal line kind.
    - Generate them from the P2 code at `00ec9a5` (check it out in a scratch worktree), not by hand. Say how in a README in that folder.
    - Each carries its source version, `00ec9a5`.
  - **Reads the same.**
    - `the accepted app's files read the same in P3` parses every fixture with today's shared core (`src/data/contracts`, `src/data/spine`) and, in the runner, with the runner's readers.
    - It fails if a field is dropped, refused or changed in meaning.
  - **Listed changes.**
    - `docs/harness/2026-10-07-p3-compatibility.md` lists each commit since `00ec9a5` touching `src/features/**` or `src/data/contracts/**`, with the entry id it belongs to and one line on what it changes for the accepted app's files ("none" is a valid answer).
    - `every change since the P2 freeze is listed` (in `src/docs.test.ts`) reads `git log` the way the existing docs tests read the repository. It fails on a commit in those paths that is not in the list.
  - **Red first:** commit the tests before the fixtures and the list exist, and show them failing.
  - **Files in scope:** the fixtures folder, the tests, the doc, and `src/docs.test.ts`. If a fixture exposes a real incompatibility, stop and report it. Don't fix product code in this entry.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - No e2e is needed.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
