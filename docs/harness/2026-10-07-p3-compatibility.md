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
| `3cc965f` | worker-reads-pile-notes | adds an optional `nothingReady: true` to the run report (`types.ts`, `run-checkpoint.ts`, `layout.ts`): files the accepted app wrote never carry it and still read the same; a P3 report with it reads in the accepted app as an empty report. The done line "Nothing in the inbox was ready yet, so it stays as it is." is screen words |
| `8f74a46` | rules-template-bower | none: `RULES_TEMPLATE` (the empty Rules.md text and its `by: bower` mark) is added to the contracts and the fake Worker makes the file from it with the same bytes as before; no check or file shape changed |
| `40ec716` | rules-repair-existing-folder | none: `OLD_RULES_TEMPLATE` (the first template's plain Rules.md text) moved from the Worker into the contracts with the same bytes, so the runner's repair and the Worker's share it; no check or file shape changed |
