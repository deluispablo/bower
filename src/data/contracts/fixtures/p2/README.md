# Files the accepted app wrote (P2, commit `00ec9a5`)

Each fixture is `{ "source": "00ec9a5", "files": [{ "path", "content" }] }`: the file's place in the Bower folder and its parsed content. Records under `.bower/runs` and `.bower/piles` are rewritten as canonical record JSON in the tests, which checks the hash in their names. The made-up Alex folder is the only data in them.

| Fixture | What it holds |
| --- | --- |
| `last-run`, `questions`, `suggestions`, `requests`, `hashes` | the runner's files in `.bower/` |
| `run-manifest`, `run-checkpoint` (the whole chain), `run-report` | one run's records |
| `pile-declaration`, `pile-disposition` | the app's declarations of two piles, and the run's dispositions of them |
| `journal-<kind>` | one line of the change journal for each kind (`journal-rule-removes` is the rule taken out) |

Not here: a `removed` pile disposition. The P2 app has no code that writes one (only the contract's own tests make it), so no P2 file shows it.

## How they were made

Not by hand, from the P2 code:

1. `git worktree add /private/tmp/p2-freeze-00ec9a5 00ec9a5 --detach`, with the repository's `node_modules` linked in.
2. Copy `generator/p2gen.test.ts.txt` to `src/p2gen.test.ts` there and run `node_modules/.bin/vitest run src/p2gen.test.ts`. It drives the P2 `DriveVault` (with pile declarations on) and the P2 fake runner (`tidyUp`) over the pretend Drive, and writes what it finds under `.bower/` to `/tmp/p2gen`. The questions and suggestions are those the P2 seed puts in the default folder; the journal lines are copied right after each action.
3. `node generator/assemble.mjs` wraps them into the files here.
4. Remove the worktree.

The ids and times in them are the ones of that run; nothing was edited.
