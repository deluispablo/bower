# Phase 2: App logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work inside the harness (Task 0): one feature at a time, a feature flips to `"passes": true` in `harness/features.json` only when its `verify` command is green, and every session ends with a line in `harness/progress.md` and a commit.

**Goal:** Put real logic (Google Drive as the only state, a Worker for session and runs) behind the doors the demo already uses (`src/data/sources.ts`), so the same screens run on Drive without changing.

**Architecture:** Two narrow clients (`DriveApi`, `WorkerApi`), each with an HTTP implementation and an in-memory fake. The live sources (`DriveVault`, `LiveSession`, `LiveRuns`) are built only on those clients. The fake stack (fake Drive, fake Worker with a scripted runner, seeded with Alex's folder) runs in the browser behind `?source=fake`. It is the acceptance harness: one contract suite and the whole Playwright suite must pass on both the demo and the fake stack. The real Worker arrives in phase 3 and implements `docs/specs/2026-10-04-worker-contract.md`, written in Task 9.

**Tech Stack:** React 19, Vite 8, TypeScript 6 strict, Zustand, Vitest, Playwright (system Chrome), Google Drive REST v3 over `fetch`. One new runtime dependency: `vite-plugin-pwa` (Task 14; installable app and an offline shell).

**Spec:**
- `docs/specs/2026-10-04-who-does-what.md`: the three layers, the journal, piles, ownership.
- `docs/specs/2026-10-04-app-ui-design.md`: phase list, stack.
- The demo, `src/data/demo/world.ts`, is the behavioural contract. Where this plan and the demo disagree, the demo wins.

## Global Constraints

- **Personal data:** none, ever. Use Alex, `you@example.com` and `FOLDER_ID`; every name is made up. No tokens, ids or vault content in code, tests, fixtures, docs or commits.
- **Git:** local only. Never `git push`, never add a remote. Commit after every task.
- **TypeScript:** strict, no `any` (`unknown`, then narrow), explicit return types on exports. Stay on TS 6 (`~6.0.3`); TS 7 breaks typescript-eslint.
- **Errors:** never swallowed. Every rejection from a source is a `BowerError(code, message)`, and the message is one short sentence for the person. Details go to `console.error`.
- **UI copy:** English, no jargon. Say "your notes" or "your Bower folder", never "vault", "Drive id" or "journal".
- **No hard deletes from the app:** only Drive's Bin (`trashed: true`). The app never writes `index.md`, `hot.md` or `log.md`.
- **Ownership:** the app never writes a note's *Current state*, *Timeline* or *Bower's note* sections, or the frontmatter keys Bower owns. Only the body is yours: tasks, rename, move.
- **Concurrency:** every content write passes the modifiedTime it read (a write to an existing text file); a move or rename checks the name and place it read, since a text change elsewhere does not clash with it. On a mismatch either writes nothing and rejects with `BowerError('conflict', 'This note changed somewhere else. Open it again to see the new version.')`.
- **Tests:** hermetic, with no network, no real Google and no real Claude. `fetch` is stubbed, and Drive is `FakeDrive`.
- **Gates:** `pnpm check` (lint, typecheck, unit tests, build) green after every task. `pnpm e2e` green on the demo after every task that touches screens.
- **Dependencies:** a new runtime dependency needs a one-line reason in the commit body.

## Review Focus

1. **Another device changed the note between read and write:** a tick or rename writes nothing and the person sees the conflict sentence. Test: Task 6, `toggleTask rejects on a stale modifiedTime`.
2. **Two files with the same name in one Drive folder:** Drive allows it, paths cannot. The second shows as `Name (2).ext` and is opened, moved and renamed as itself. Test: Task 5, `same-name siblings get distinct paths`.
3. **The Drive token expires mid-session:** a 401 refreshes the token once and retries. A second 401 makes `Session.current()` resolve `null`, and the app goes to sign-in. Test: Task 3, `401 refreshes once then fails with auth`.
4. **The network drops halfway through adding a pile:** the pile stays in the inbox with the things that made it. A failed item shows `upload: -1`, and "Try again" sends only the missing ones, never a duplicate. Test: Task 13, `retry uploads only the missing items`.
5. **A large folder (2,000+ files):** listing follows `nextPageToken` and batches parent queries, so the tree is complete. Test: Task 3, `listAll follows pages and batches parents`.

---

### Task 0: The harness

**Files:**
- Create: `harness/README.md`, `harness/features.json`, `harness/progress.md`, `harness/init.sh`, `scripts/harness-status.mjs`
- Create: `src/data/contract/vault-contract.ts`, `src/data/contract/demo.contract.test.ts`
- Modify: `package.json` (scripts `harness`, `init`), `CLAUDE.md` (a "Harness" section pointing to `harness/README.md`)

**Interfaces:**
- Produces: `describeVaultContract(name: string, make: () => Promise<ContractWorld>): void`, where `interface ContractWorld { sources: Sources; dispose(): void; tidyUp(): Promise<void> }`. `tidyUp` runs one tidy-up to its end on that world's own clock: instant for the demo, the fake runner for the fake stack.

- [ ] **Step 1: Write `harness/README.md`.** It holds the rules, one line each:
  - Read `progress.md` and `features.json` first.
  - Pick the first feature with `"passes": false`.
  - Do not edit the `verify` field of any feature.
  - Flip `passes` only after running its `verify` and seeing it green.
  - Append one dated line to `progress.md`.
  - Commit.
  - Never mark two features in one commit.

- [ ] **Step 2: Write `harness/features.json`.** It is an array of `{ "id", "task", "what", "verify", "passes": false }`, one entry per task 1 to 14, with the ids `note-format`, `drive-fake`, `drive-http`, `layout-seed`, `vault-index`, `vault-files`, `vault-inbox`, `add-files`, `worker`, `live`, `source-switch`, `e2e-fake`, `duplicates` and `pwa`. Each `verify` is the exact command from that task's step 4. Every task's last step flips its own id.

- [ ] **Step 3: Write `harness/init.sh`.** It runs `pnpm install --frozen-lockfile`, then `pnpm check`, then `node scripts/harness-status.mjs`, which prints `n/m features pass` and the next one.

- [ ] **Step 4: Write the contract suite in `vault-contract.ts`.** Each group lifts the behaviours the demo already guarantees from `world.test.ts`, as named tests:
  - **Move and rename:**
    - `move keeps a note's content`;
    - `rename keeps the extension`;
    - `rename refuses a case-insensitive clash` (code `conflict`);
    - `rename refuses a leading dot`;
    - `Rules.md and About me.md cannot be moved, renamed or binned`.
  - **Create, bin and restore:**
    - `create gives a free name`;
    - `trash then restore puts it back`;
    - `restore never overwrites` (it gets ` (2)`).
  - **Piles:**
    - `addPile with a line makes Inbox/<day> <line>/ with Pile note.md`;
    - `a lone thing with no line sits at the inbox root`;
    - `a pile can be only a note`;
    - `removePile bins the whole pile`;
    - `updatePile changes the note`.
  - **Tasks:**
    - `toggleTask flips the n-th body task only`;
    - `toggleTask never touches Current state or Timeline`.
  - **Journal:**
    - `every change writes one journal entry`;
    - `undo of a move removes its entry`;
    - `made and binned straight away leaves no trace`.
  - **Rules, questions and search:**
    - `addRule shows as pending with your words`;
    - `answer removes the question and journals it`;
    - `search finds note text and skips the inbox`.
  - **Tidy-up:**
    - `after tidyUp the journal is empty and the piles taken are gone`;
    - `a pile added during a run waits for the next one`.

- [ ] **Step 5: Run the suite on the demo.** `demo.contract.test.ts` calls `describeVaultContract('demo', …)` with `new DemoWorld({ scenario: 'default', scale: 'instant' })`.
  Run: `pnpm vitest run src/data/contract`. Expected: all pass. If a test fails here, the test is wrong, not the demo: fix the test.

- [ ] **Step 6: Check and commit.**
  Run: `pnpm check && bash harness/init.sh`. Expected: green, `0/14 features pass`.
  Then: `git add -A && git commit -m "chore: phase 2 harness and the vault contract suite"`

### Task 1: The note file format

**Files:**
- Create: `src/data/vault/note-format.ts`, `src/data/vault/note-format.test.ts`

**Interfaces:**
- Produces:
  - `parseNote(path: string, text: string): Omit<Note, 'backlinks'>`
  - `serializeNote(note: Omit<Note, 'backlinks' | 'path' | 'title'>): string`
  - `toggleTaskInText(text: string, index: number): { text: string; label: string; done: boolean }`
  - `BOWER_KEYS: readonly string[]`

**The format, pinned here:**

```
---
summary: <one line>
status: <value>          (optional)
tags: [a, b]
by: bower                (byBower; absent = yours)
original: <path>         (optional)
bower_source: notes|web|both   (optional, with Bower's note)
<key>: <value>           (one per property, in order; label = key with _ → space, first letter upper; a value [[X]] sets link X)
---
## Current state
- <line>
<your body, verbatim>
## Timeline
- <date> · <text> · [[<source>]]   (source optional)
## Bower's note
<text>
```

Further rules:
- `title` is the file name without `.md`.
- `links` are the `[[targets]]` of the whole text, resolved later by the vault.
- A file with no frontmatter is a plain note of yours: the body is the whole text and every other field is empty.
- Tasks are counted only inside the body, so the index skips the three Bower sections.

- [ ] **Step 1: Write the failing tests.**
  - `round-trips every demo note`: for each `[path, seed]` of `NOTES` (fixture), `parseNote(path, serializeNote(seed))` equals the seed's fields.
  - `a note with no frontmatter is all body`.
  - `toggleTaskInText flips only the n-th body task and returns its label`.
  - `toggleTaskInText ignores tasks in Timeline`.
  - `a property [[link]] sets link`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/vault/note-format.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement the four exports** in `note-format.ts`. Parse the frontmatter by hand (flat `key: value` plus `[a, b]` lists); no YAML dependency.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `note-format`.**
  `git commit -m "feat(vault): the note file format, parsed and written"`

### Task 2: `DriveApi` and `FakeDrive`

**Files:**
- Create: `src/data/drive/drive-api.ts`, `src/data/drive/fake-drive.ts`, `src/data/drive/drive-contract.ts`, `src/data/drive/fake-drive.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DriveFile { id: string; name: string; folder: boolean; parents: string[];
  modifiedTime: string; createdTime: string; size?: number; appProperties?: Record<string, string> }
export interface DriveApi {
  listAll(rootId: string): Promise<DriveFile[]>;            // whole subtree, not in the Bin
  get(id: string): Promise<DriveFile>;
  readText(id: string): Promise<string>;
  createFolder(parentId: string, name: string): Promise<DriveFile>;
  createText(parentId: string, name: string, text: string, appProperties?: Record<string, string>): Promise<DriveFile>;
  upload(parentId: string, name: string, body: Blob, onProgress?: (fraction: number) => void): Promise<DriveFile>;
  writeText(id: string, text: string, ifModified: string): Promise<DriveFile>;
  update(id: string, patch: { name?: string; addParent?: string; removeParent?: string }): Promise<DriveFile>;
  trash(id: string): Promise<void>;
  untrash(id: string): Promise<DriveFile>;
  fullText(rootId: string, query: string): Promise<DriveFile[]>;
}
export class FakeDrive implements DriveApi { constructor(opts?: { clock?: () => number; pageSize?: number }); /* plus test hooks: */
  failNext(code: ErrorCode): void; touch(id: string): void; dump(): Map<string, string> /* path → text */ }
```

- [ ] **Step 1: Write the failing tests.** `drive-contract.ts` exports `describeDriveContract(make)`, with these tests:
  - `create then listAll sees it`;
  - `writeText with a stale modifiedTime rejects conflict`;
  - `update moves between parents`;
  - `trash hides from listAll and untrash brings back`;
  - `same names may coexist in one folder`;
  - `fullText finds text inside notes only under root`;
  - `failNext makes the next call reject with that code`.

  `fake-drive.test.ts` runs the contract on `FakeDrive`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/drive`. Expected: FAIL.
- [ ] **Step 3: Implement `FakeDrive`.** It is in memory: `Map<id, {meta, text|blob}>`. Ids are `f1`, `f2` and so on. `modifiedTime` comes from the clock as an ISO string. `touch` bumps `modifiedTime` to simulate another device.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `drive-fake`.** `git commit -m "feat(drive): DriveApi and an in-memory FakeDrive"`

### Task 3: `DriveHttp`

**Files:**
- Create: `src/data/drive/drive-http.ts`, `src/data/drive/drive-http.test.ts`

**Interfaces:**
- Consumes: `DriveApi` (Task 2).
- Produces: `class DriveHttp implements DriveApi { constructor(opts: { token: (fresh: boolean) => Promise<string>; fetch?: typeof fetch }) }`

**Pinned values:**
- **Base URLs:** `https://www.googleapis.com/drive/v3` and `https://www.googleapis.com/upload/drive/v3`.
- **Fields:** `id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed`.
- **Paging:** `pageSize=1000`, with `nextPageToken` followed.
- **Listing:** `listAll` walks breadth-first, with up to 40 parent ids per query (`'a' in parents or 'b' in parents …`) and `and trashed = false`.
- **Uploads:** multipart for 5 MB or less; resumable above that, in 8 MB chunks, with `onProgress` reporting per chunk.
- **`writeText`:** reads `modifiedTime` first and rejects `conflict` on a mismatch. Drive v3 has no ETag precondition on media updates, so the check is a read just before the write.
- **Error mapping:**
  - A 401 calls `token(true)` once and retries; a second 401 gives `auth`.
  - A 404 gives `not-found`.
  - A 403 with `rateLimitExceeded` or `userRateLimitExceeded`, or any 429 or 5xx, is retried up to 3 times (500 ms, 1 s, 2 s), then gives `unknown`.
  - A `TypeError` from `fetch` gives `offline`.
- **Messages per code:**
  - `auth`: "Sign in again to keep going."
  - `offline`: "You're offline. Try again when you're back."
  - `not-found`: "That isn't in your Bower folder any more."
  - `unknown`: "Google Drive didn't answer. Try again."

- [ ] **Step 1: Write the failing tests.** They use a stubbed `fetch` that records requests and replays canned responses:
  - `listAll follows pages and batches parents` (2 pages, 45 folders, so 2 parent batches);
  - `401 refreshes once then fails with auth`;
  - `429 retries then succeeds`;
  - `a network TypeError rejects offline`;
  - `upload over 5 MB is resumable in chunks and reports progress`;
  - `writeText checks modifiedTime and rejects conflict`;
  - `update sends addParents/removeParents`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/drive/drive-http.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `DriveHttp`.** Tests use fake timers for the backoff.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `drive-http`.** `git commit -m "feat(drive): DriveHttp over Drive REST v3"`

### Task 4: The vault layout and its seed

**Files:**
- Create: `src/data/vault/layout.ts`, `src/data/fake/seed.ts`, `src/data/fake/seed.test.ts`

**Interfaces:**
- Consumes: `DriveApi`, `serializeNote`, and the fixture's `SEEDS`, `NOTES`, `seedPiles`, `seedQuestions`, `seedRules` and `seedSuggestions`.
- Produces:
  - `SYSTEM` = `{ dir: '.bower', changes: '.bower/changes', archive: '.bower/changes/archive', lastRun: '.bower/last-run.json', questions: '.bower/questions.json', suggestions: '.bower/suggestions.json', requests: '.bower/requests.json', hashes: '.bower/hashes.json' } as const`
  - `HIDDEN_AT_ROOT = ['index.md', 'hot.md', 'log.md'] as const`
  - `isHidden(path: string): boolean`, which hides `.bower/`, any dot path and `HIDDEN_AT_ROOT`
  - `seedFakeDrive(drive: FakeDrive, scenario: Scenario, now: number): Promise<string>`, which returns the root folder id

**JSON files the runner owns, all with `v: 1`:**
- `questions.json`: `{ v: 1, questions: Question[] }`
- `suggestions.json`: `{ v: 1, suggestions: Suggestion[] }`
- `requests.json`: `{ v: 1, done: Record<string, string> }`, from the request entry's id to Bower's one line
- `last-run.json`: `{ v: 1, run: RunState }`, the `RunState` without `seen`
- `hashes.json`: `{ v: 1, hashes: Record<string, string> }`, from SHA-256 hex to path

**`Rules.md`** is written exactly as `DemoWorld.rulesNote()` lays out its body (`## Rules`, then `- <wording>`, with your words on the next line as `  *You wrote: "…"*`).

- [ ] **Step 1: Write the failing tests.**
  - `seed makes Alex's folder`: every `SEEDS` path exists, and each `NOTES` file parses back to its seed.
  - `seed per scenario`: `first` leaves no root, `empty` leaves an empty inbox, and `back` writes `last-run.json`.
  - `isHidden hides system files only`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/fake/seed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `layout.ts` and `seed.ts`.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `layout-seed`.** `git commit -m "feat(vault): folder layout and a seeded fake Drive"`

### Task 5: `VaultIndex`, from path to Drive id

**Files:**
- Create: `src/data/vault/vault-index.ts`, `src/data/vault/vault-index.test.ts`, `src/data/vault/seen.ts`

**Interfaces:**
- Consumes: `DriveFile`, the `Entry` and `Entries` types from `tree.ts`, and `isHidden`.
- Produces:
  - `class VaultIndex { static build(rootId: string, files: DriveFile[]): VaultIndex; idOf(path: string): string | undefined; pathOf(id: string): string | undefined; file(path: string): DriveFile | undefined; entries(): Entries; systemId(path: string): string | undefined; put(file: DriveFile): void; drop(id: string): void }`
  - `seen.ts`: `markSeen(id: string, modified: string): void` and `isSeen(id: string, modified: string): boolean`, both in localStorage under `bower:seen`, with every access wrapped in try/catch.

**Entry fields:**
- `byBower` is `appProperties.by === 'bower'`; the runner sets it.
- `hub` is true when the name equals `<folder name>.md`.
- `isNew` is true when the path is in the last run's `filed[].to` or `created[]` and is not `isSeen`.

- [ ] **Step 1: Write the failing tests.**
  - `same-name siblings get distinct paths`: two `Lease.pdf` give `Lease.pdf` and `Lease (2).pdf`, ordered by `createdTime`.
  - `hidden files are kept out of entries but reachable by systemId`.
  - `put after a rename moves the subtree's paths`.
  - `drop removes a folder and everything under it`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/vault/vault-index.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the index and `seen.ts`.**
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `vault-index`.** `git commit -m "feat(vault): the path index over Drive ids"`

### Task 6: `DriveVault` files (tree, notes, moves, tasks, search)

**Files:**
- Create: `src/data/vault/drive-vault.ts`, `src/data/vault/journal.ts`, `src/data/vault/journal.test.ts`, `src/data/contract/fake.contract.test.ts`

**Interfaces:**
- Consumes: `DriveApi`, `VaultIndex`, `parseNote`, `toggleTaskInText`, and from `tree.ts` the pure rules `freeName`, `renameEntry`, `moveEntry` and `isRoot`.
- Produces:
  - `class Journal { constructor(drive: DriveApi, folderId: () => Promise<string>, device: string); record(kind: ChangeKind, what: string, extra?: JournalExtra): Promise<ChangeEntry>; list(): Promise<JournalRecord[]>; remove(id: string): Promise<void> }`
  - `JournalExtra = { path?: string; from?: string; text?: string; questionId?: string }`
  - `JournalRecord = ChangeEntry & JournalExtra & { v: 1; device: string }`
  - A journal file is named `<ISO at>-<6 base36>.json`, with one record per file.
  - `class DriveVault implements VaultSource { constructor(opts: { drive: DriveApi; rootId: () => Promise<string>; runningPiles: () => ReadonlySet<string> }) }`. This task implements `tree`, `note`, `move`, `rename`, `create`, `trash`, `restore`, `markSeen`, `toggleTask`, `search`, `changes` and `subscribe`. The other methods throw `BowerError('unknown', 'Not ready yet.')` until Task 7.

**Behaviour, pinned:**
- `tree()` lists once, caches the index, and lists again after any write and on `subscribe` consumers' `reload`.
- `note(path)` reads the text and parses it. Backlinks come from `drive.fullText(root, '[[<title>]]')`.
- Writes apply the same `tree.ts` rules as the demo before any call to Drive.
- A rename of a note keeps `.md`.
- `trash` keeps `{id, path}` in memory for `restore`.
- `restore` untrashes the file and, on a name clash, renames it to `freeName`.
- `search` combines index names (score 3) with `fullText` (score 1), leaves out `Inbox/`, and keeps at most 30 results.
- `move` with `{ undo: true }` removes the journal entry of the move it reverses.
- `trash` of something created since the last tidy-up removes that `create` entry and writes no entry of its own.

- [ ] **Step 1: Write the failing tests.**
  - `journal.test.ts`: `record writes one file per change`, `list sorts newest first`, `remove deletes only that file (to the Bin)`.
  - `fake.contract.test.ts` calls `describeVaultContract('fake', …)` with `FakeDrive` seeded by `seedFakeDrive` and a `DriveVault`, skipping the pile, rules, questions and tidy-up groups for now (`describe.skip`, removed in Task 7).
  - `drive-vault.test.ts` covers Review Focus 1, `toggleTask rejects on a stale modifiedTime` (`FakeDrive.touch` between read and write), and `a file in the Bin is not in the tree`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/vault src/data/contract`. Expected: FAIL.
- [ ] **Step 3: Implement `Journal`, then the `DriveVault` methods listed above.**
- [ ] **Step 4: Run them again.** Same command. Expected: PASS, demo and fake.
- [ ] **Step 5: Commit, then flip `vault-files`.** `git commit -m "feat(vault): files, notes and the change journal on Drive"`

### Task 7: `DriveVault` inbox, rules and Bower

**Files:**
- Modify: `src/data/vault/drive-vault.ts`, `src/data/types.ts` (`NewPile` items), `src/data/contract/fake.contract.test.ts` (remove the skips)
- Create: `src/data/vault/rules-format.ts`, `src/data/vault/rules-format.test.ts`

**Interfaces:**
- Produces:
  - In `types.ts`, `NewPile.items` becomes `Array<Pick<PileItem, 'name' | 'kind' | 'origin'> & { body?: Blob; url?: string }>`. The demo ignores `body` and `url`.
  - `parseRules(text: string): Rule[]` and `RULES_HEADING = '## Rules'`.
  - `DriveVault` gains `piles`, `addPile`, `removePile`, `updatePile`, `rules`, `addRule`, `requests`, `addRequest`, `questions`, `answer`, `suggestions` and `dismissSuggestion`.

**Behaviour, pinned:**
- **`piles()`:** each subfolder of `Inbox` is a pile. Its `id` is the folder's Drive id, its `text` comes from `Pile note.md`, and its `createdAt` is the folder's `createdTime`. Each loose file at the inbox root is a pile with `text: ''`, and its `id` is the file's id.
- **`addPile`:**
  - It creates the folder `pileFolderName` (taken through `freeName`) when `pileHasFolder` says so, writes `Pile note.md`, then sends each item.
  - A `body` goes through `drive.upload`. A `url` becomes `<name>.url` holding `[InternetShortcut]\nURL=<url>\n`.
  - It returns as soon as the folder and the note exist. Items carry `upload` (0 to 1) through `subscribe` until they are in Drive, and an item that fails carries `upload: -1`.
- **`removePile`:** bins the folder or the lone file. It rejects with `conflict` "A tidy-up is reading this pile. Remove it when it's done." when the id is in `runningPiles()`.
- **`rules()`:** `parseRules(Rules.md)`, then the journal's `rule` records as `{ pending: true, yourWords: text }`.
- **`addRule`:** writes the journal entry only. `Rules.md` is the runner's to word (spec, "The change journal").
- **Requests:**
  - `requests()` lists the journal's `request` records, then the archived ones in `.bower/changes/archive/` that have a `done` line in `requests.json`.
  - `addRequest` writes a journal entry.
- **Questions:**
  - `questions()` reads `questions.json`, minus the ids answered in the journal.
  - `answer(id, yes)` writes a journal `answer` record with `questionId` and the text `yes`/`no`.
- **Suggestions:**
  - `suggestions()` reads `suggestions.json`, minus the ids dismissed on this device (localStorage `bower:dismissed`).
  - `dismissSuggestion(id, true)` also calls `addRule(title)`.

- [ ] **Step 1: Write the failing tests.**
  - `rules-format.test.ts`:
    - `parses wording and your words`;
    - `round-trips the demo's Rules.md`, using the text built from `seedRules`.
  - In the contract, the pile, rules and questions groups are no longer skipped (the tidy-up group stays skipped until Task 10).
  - In `drive-vault.test.ts`:
    - `addPile with a link writes a .url file`;
    - `removePile refuses a pile the run took`;
    - `an upload that fails marks upload -1 and keeps the rest`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/vault src/data/contract`. Expected: FAIL.
- [ ] **Step 3: Implement** `rules-format.ts` and the methods above.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS, except the tidy-up group, which is skipped.
- [ ] **Step 5: Commit, then flip `vault-inbox`.** `git commit -m "feat(vault): piles, rules, requests and questions on Drive"`

### Task 8: Sending real files from Add

**Files:**
- Modify: `src/features/piles/Add.tsx`
- Create: `src/features/piles/draft-files.ts`, `src/features/piles/draft-files.test.ts`

**Interfaces:**
- Consumes: the new `NewPile` item shape (Task 7).
- Produces: `draft-files.ts`, a module-level `Map<draftId, Blob>` with `keep(id: string, b: Blob): void`, `take(id: string): Blob | undefined` and `forget(id: string): void`.

**Behaviour, pinned:**
- A draft (kept in sessionStorage) holds names only. A draft whose blob is gone after a reload shows "Add this file again" and is left out of the pile.
- A link draft sends `url`.

- [ ] **Step 1: Write the failing tests.** `draft-files.test.ts`: `keep then take returns the blob once`. Add one e2e test to `e2e/app.spec.ts`: `after a reload an added file asks to be added again`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/features/piles && pnpm e2e -g "added again"`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `add-files`.** `git commit -m "feat(add): send the files themselves"`

### Task 9: `WorkerApi`, its contract and `FakeWorker`

**Files:**
- Create: `docs/specs/2026-10-04-worker-contract.md`, `src/data/worker/worker-api.ts`, `src/data/worker/worker-http.ts`, `src/data/worker/worker-http.test.ts`, `src/data/fake/fake-worker.ts`, `src/data/fake/fake-runner.ts`, `src/data/fake/fake-runner.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RunWire { id: string; scope: 'all' | 'instructions'; phase: RunPhase; requestedAt: number;
  phaseAt: number; finishedAt?: number; total?: number; failure?: string }
export interface Me { user: User; folderId: string | null }
export interface WorkerApi {
  me(): Promise<Me | null>;                 // GET /me, 401 → null
  signInUrl(): string;                      // GET /auth/login
  signOut(): Promise<void>;                 // POST /auth/logout
  driveToken(fresh: boolean): Promise<string>;   // GET /drive/token{?fresh=1} → { accessToken, expiresAt }
  createFolder(): Promise<string>;          // POST /vault → { folderId }
  process(scope: 'all' | 'instructions'): Promise<RunWire>;  // POST /process; 409 when one runs → BowerError conflict
  status(): Promise<RunWire | null>;        // GET /status
}
export class WorkerHttp implements WorkerApi { constructor(base: string, f?: typeof fetch) }  // credentials: 'include'; errors { error: { code, message } }
export class FakeWorker implements WorkerApi { constructor(opts: { drive: FakeDrive; scenario: Scenario; scale: TimeScale; rootId: string | null }) }
export function runFake(drive: FakeDrive, rootId: string, opts: { failOnce: boolean; onPhase: (p: RunPhase) => void; scale: TimeScale }): Promise<RunReport>;
```

**The contract document** records each route:
- method and path;
- the body;
- the answer;
- the status codes;
- whether a same-origin check applies.

It also records the dispatch payload to the runner and states that the runner writes `.bower/last-run.json`. Phase 3 builds exactly this.

**What the fake runner does,** in order, with phases timed by `PHASE_MS[scale]`:
1. It snapshots the inbox piles as `runPiles`.
2. It files each thing by the fixture's `FILING` (otherwise `Resources/`).
3. It writes companion notes as `note.create`.
4. It words the pending rules with `wordRule` into `Rules.md`.
5. It marks request entries done in `requests.json`.
6. It moves the journal records to `archive/`.
7. It writes `last-run.json`, `questions.json` and `hashes.json`.

With `failOnce`, the first run fails in the `writing` phase with "Bower stopped while writing your notes. Nothing was lost; try again." and leaves the inbox untouched.

- [ ] **Step 1: Write the failing tests.**
  - `fake-runner.test.ts`:
    - `files every pile it took and empties the journal`;
    - `a pile added during the run stays`;
    - `failOnce leaves the inbox as it was`;
    - `pending rules are worded with your words kept`.
  - `worker-http.test.ts`:
    - `401 on /me gives null`;
    - `409 on /process rejects conflict`;
    - `error JSON message reaches BowerError`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/worker src/data/fake`. Expected: FAIL.
- [ ] **Step 3: Write the contract document, then implement** `WorkerHttp`, `FakeWorker` and `runFake`.
- [ ] **Step 4: Run them again.** Same command. Expected: PASS.
- [ ] **Step 5: Commit, then flip `worker`.** `git commit -m "feat(worker): the Worker contract, its HTTP client and a fake"`

### Task 10: `LiveSession` and `LiveRuns`

**Files:**
- Create: `src/data/live/session.ts`, `src/data/live/runs.ts`, `src/data/live/live.test.ts`, `src/data/live/index.ts`

**Interfaces:**
- Consumes: `WorkerApi`, `DriveApi`, `DriveVault` and `SYSTEM.lastRun`.
- Produces:
  - `class LiveSession implements Session`
  - `class LiveRuns implements RunSource`
  - `makeLiveSources(opts: { worker: WorkerApi; drive: DriveApi }): Sources & { dispose(): void }`

**Behaviour, pinned:**
- `signIn()` sets `location.href = worker.signInUrl()` and returns a promise that never settles.
- `createFolder(onStep)` calls `worker.createFolder()`, then polls `listAll` every 500 ms (for up to 20 s) and calls `onStep` once for each root as it appears.
- `LiveRuns` polls `status()` every 4 s while a run is going and every 60 s otherwise, and again on `visibilitychange` to visible.
- When a run reaches `done` or `failed`, `LiveRuns` reads `last-run.json` for the report and tells the vault to list again.
- `seen` is per device, kept in localStorage `bower:run-seen` as a run id.
- `start` returns a conflict when a run is going.
- The vault's `runningPiles()` comes from the run's snapshot (the `RunWire.id`, plus the piles listed at `start`).

- [ ] **Step 1: Write the failing tests.**
  - `a run walks the phases and ends with its report`, with fake timers and `FakeWorker` at the instant scale.
  - `a failed run carries its sentence`.
  - `seen survives a new LiveRuns`.
  - `createFolder reports each root once`.
  - Remove the skip on the tidy-up group in `fake.contract.test.ts`: its `tidyUp` now goes through `LiveRuns.start('all')`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/live src/data/contract`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them again.** Same command. Expected: PASS, with the whole contract green on demo and fake.
- [ ] **Step 5: Commit, then flip `live`.** `git commit -m "feat(live): session and runs over the Worker"`

### Task 11: Choosing the source at start

**Files:**
- Modify: `src/main.tsx`, `src/data/demo/scenario.ts` (`readSource()`), `src/data/demo/DemoPanel.tsx` (a Source row: Demo / Fake Drive), `src/app/App.tsx` (the `demo` prop is optional when the source is not the demo)
- Create: `src/data/choose.ts`, `src/data/choose.test.ts`

**Interfaces:**
- Produces: `type SourceKind = 'demo' | 'fake' | 'real'`, `readSource(): SourceKind` and `buildSources(kind: SourceKind, scenario: Scenario, scale: TimeScale): Promise<{ sources: Sources; world?: DemoWorld }>`.

**How the source is picked:**
1. `real` when `import.meta.env.VITE_API_URL` is set and there is no `?source=` in the URL.
2. Otherwise the `?source=` value, kept in sessionStorage `bower:demo:source`.
3. Otherwise `demo`.

For `fake`, a `FakeDrive` is seeded per scenario and wrapped as `makeLiveSources({ worker: new FakeWorker(…), drive })`. For `real`, the sources are `new WorkerHttp(VITE_API_URL)` and `new DriveHttp({ token: (f) => worker.driveToken(f) })`. The demo-panel scenarios work on `fake` too. The sample-pile buttons only appear on `demo`.

- [ ] **Step 1: Write the failing tests.** `choose.test.ts`:
  - `the query wins over storage`;
  - `real only with VITE_API_URL and no query`;
  - `fake sources answer tree()`.
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/choose.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them again, then check by hand.** Run the tests again, then `pnpm check`. Expected: PASS. Open `http://localhost:5190/?source=fake` and see Home with Alex's piles.
- [ ] **Step 5: Commit, then flip `source-switch`.** `git commit -m "feat: pick demo, fake Drive or the real Worker at start"`

### Task 12: The whole e2e suite on the fake stack

**Files:**
- Create: `e2e/fixtures.ts`
- Modify: `e2e/app.spec.ts`, `e2e/robustness.spec.ts` and `e2e/screens.spec.ts` (import `test` and `expect` from `./fixtures`), `playwright.config.ts`, `package.json` (script `e2e:fake`)

**Interfaces:**
- Produces:
  - `e2e/fixtures.ts` exports `test` with `page.goto` wrapped so that it appends `source=<E2E_SOURCE>` when that variable is set.
  - `isFake: boolean`.
  - The script is `"e2e:fake": "E2E_SOURCE=fake playwright test"`.

- [ ] **Step 1: Switch the specs to the fixture.** Only tests that use demo-only controls (the sample piles) get `test.skip(isFake, 'demo-only control')`.
- [ ] **Step 2: Run the fake suite.** `pnpm e2e:fake`. Expected: failures that show where the live sources differ from the demo.
- [ ] **Step 3: Fix each difference in the live sources, never in the tests.** Each difference gets its own commit, `fix(live): …`, with the failing test named in the body.
- [ ] **Step 4: Run both suites.** `pnpm e2e && pnpm e2e:fake`. Expected: both green, with the same count except the declared skips.
- [ ] **Step 5: Commit, then flip `e2e-fake`.** `git commit -m "test: the whole e2e suite runs on the fake Drive"`

### Task 13: Duplicates and upload retry

**Files:**
- Create: `src/data/vault/hashes.ts`, `src/data/vault/hashes.test.ts`
- Modify: `src/data/sources.ts` (`duplicates`, `retryPile`), `src/data/demo/world.ts` (match by name), `src/data/vault/drive-vault.ts`, `src/features/piles/Add.tsx`, `src/features/piles/PileScreen.tsx`

**Interfaces:**
- Produces:
  - In `VaultSource`: `duplicates(files: Array<{ name: string; body?: Blob }>): Promise<Array<string | null>>`, which returns the path you already have, or `null`.
  - In `VaultSource`: `retryPile(id: string): Promise<void>`.
  - `sha256(b: Blob): Promise<string>`, the hex digest from `crypto.subtle`.

**Copy, pinned:**
- Add marks a duplicate item: "You already have this in <folder>." with the buttons "Leave it out" and "Add it anyway".
- The pile screen shows a failed item as "Didn't arrive" with a "Try again" button.

- [ ] **Step 1: Write the failing tests.**
  - `hashes.test.ts`: `sha256 of a known blob`, and `duplicates finds a match from hashes.json`.
  - `drive-vault.test.ts` covers Review Focus 4: `retry uploads only the missing items`.
  - e2e: `Add warns about a file you already have` (demo and fake).
- [ ] **Step 2: Run them.** `pnpm vitest run src/data/vault && pnpm e2e -g "already have"`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them again,** then `pnpm e2e:fake -g "already have"`. Expected: PASS.
- [ ] **Step 5: Commit, then flip `duplicates`.** `git commit -m "feat(add): warn about duplicates and retry failed uploads"`

### Task 14: Installable app with an offline shell

**Files:**
- Modify: `package.json` (`vite-plugin-pwa`; reason: installable app and an offline shell, with no hand-written service worker), `vite.config.ts`, `index.html` (manifest link, theme colours from `tokens.json`)
- Create: `e2e/pwa.spec.ts`

**Pinned values:**
- The service worker precaches the app shell only.
- It caches nothing from `googleapis.com` or the Worker.
- The manifest name is `Bower`; the icons are the existing head favicon at 192 and 512.

- [ ] **Step 1: Write the failing test.** `e2e/pwa.spec.ts`: `the built app has a manifest and registers a service worker`. It runs against `vite preview` in its own config.
- [ ] **Step 2: Run it.** `pnpm build && pnpm exec playwright test e2e/pwa.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run it again.** Same command. Expected: PASS. Also run `pnpm check`.
- [ ] **Step 5: Commit, then flip `pwa`.** `git commit -m "feat: installable app with an offline shell"`

### Task 15: Close the phase

**Files:**
- Modify: `README.md` (sources, `?source=fake`, `pnpm e2e:fake`), `CLAUDE.md` (phase 2 done; the harness), `docs/specs/2026-10-04-who-does-what.md` (the JSON files of Task 4 under a "Files in `.bower/`" section), `harness/progress.md`

- [ ] **Step 1: Run every gate.** `bash harness/init.sh && pnpm e2e && pnpm e2e:fake`. Expected: green, `14/14 features pass`.
- [ ] **Step 2: Update the docs listed above.**
- [ ] **Step 3: Run the whole-branch review.** A fresh reviewer checks the branch against this plan, the Review Focus and the Global Constraints. Fix what it confirms.
- [ ] **Step 4: Commit.** `git commit -m "docs: phase 2 done"`

## Left out of phase 2, on purpose

- **Pause and resume uploads:** the old app had a durable upload queue that survives closing the app, built on IndexedDB. Phase 2 sends from memory, and a reload asks for the file again.
- **The Worker and push notifications:** the real Worker, sign-in with Google and push notifications are phase 3.
- **The agent:** the real runner and Claude's operations are phase 4. The fake runner stands in.
- **Undo this tidy-up:** it needs the runner's manifest (phase 4).
- **Editing a note's body:** CodeMirror comes later. Phase 2 ticks tasks only.
