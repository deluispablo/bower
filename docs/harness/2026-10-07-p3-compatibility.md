# P3 compatibility with the accepted app (P3-18)

The P2 app was accepted at `00ec9a5`. The files it wrote are kept in `src/data/contracts/fixtures/p2/` (made from the P2 code; see its README). `the accepted app's files read the same in P3` (`src/data/compat-p2.test.ts`, and `runner/test/compat-p2.test.ts` for the runner's readers) reads every one with today's shared core and the runner, and fails if a field is dropped, refused or changed in meaning.

## Changes since the freeze in `src/features/**` and `src/data/contracts/**`

`every change since the P2 freeze is listed` (in `src/docs.test.ts`) reads `git log 00ec9a5..HEAD` for those two paths and fails on a commit missing from this table. One row per commit: short SHA, entry, what it changes for the accepted app's files.

| Commit | Entry | What it changes for the accepted app's files |
| --- | --- | --- |
| `f93f70a` | shared-domain-package | none: the pure core moved under `src/data/contracts`; imports changed, no check or file shape did |
| `592af95` | worker-google-oidc | none: the sign-in screen follows the Worker's callback redirect; it writes no file in the folder |
| `d1f69b8` | spine-admission-manifest | none: `isJournalRecord` and `isRunWire` moved into the contracts with the same checks |
| `41f6356` | upload-queue-real | none: a test for the line a pile item shows |
| `0b05ec4` | upload-queue-real | none: a pile item whose bytes are lost reads "Didn't arrive. Choose the file again."; the words are the screen's, not a file's |
| `2650a73` | compatibility-accepted-app | none: the fixtures themselves, and nothing else |
