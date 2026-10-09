# Diagnosis: app-bin-skips-read-check (2026-10-09)

Source: DEFECT_LOG.md:66; Codex TL-P3-16 review, finding 2. Read on claude/p3 b68d8146. Read-only; no code edited.

## What failed

The app sends every Bin through `toBin`, which goes straight to `trash`
(src/data/vault/drive-vault.ts:1747), with no fresh read of the target's name and place before the send.

- `once` (drive-vault.ts:1733) calls `updateByStamp` (src/data/spine/write-once.ts:87). That function sends first and
  reads by id only after an unsettled answer (write-once.ts:37-49, `once`). `notAsSeen` runs only on that lost-answer
  path (drive-vault.ts:1740).
- `DriveHttp.trash` (src/data/drive/drive-http.ts:207) is a plain `PATCH {trashed:true}`.
- The live wrapper `bound` (src/data/live/index.ts:291) runs `drivePolicy.before` (src/data/session.ts:690). That is the
  place/lease check only.
- **Reproduced** with a scratch unit test against the FakeDrive (outside the repo, run under `harness/with-lock.sh`).
  Each case lists the files, moves the target into `Projects` directly in Drive, then acts:
  - control `move` → `rejected conflict`
  - `trash(note)` → `resolved`, `{trashed:true, inProjects:true}`
  - `trash('Inbox/Dentist reminder.pdf')` (pile) → `resolved`, `{trashed:true, inProjects:true}`
  - `removePile(id)` → `resolved`, `{trashed:true, inProjects:true}`
  - So the filed pile goes to the Bin. The existing test drive-vault.test.ts:3089 passes only because it refuses the
    trash itself (`refuse('trash')`).

Each caller, checked for a pre-send "still as seen" check:

| Caller | file:line | Check before send? |
| --- | --- | --- |
| `trash`, Inbox pile (Explorer "Remove the pile", Files Delete) | drive-vault.ts:400 | **No** (reproduced) |
| `trash`, note/file/folder | drive-vault.ts:429 | **No** (reproduced) |
| `removePile` (PileScreen.tsx:344), pile folder or lone file | drive-vault.ts:1024 | **No** (reproduced) |
| declaration copies (`binDeclarations`, via 399 and 1022) | drive-vault.ts:703 | No |
| `updatePile`: declaration copies of a lone thing | drive-vault.ts:1089 | No |
| `updatePile`: pile note Bin | drive-vault.ts:1112 | Partial: a hand-written modifiedTime-only check at 1078; name and place not checked |
| uploads made under a lost answer (`held.made`) | drive-vault.ts:404, 1030 | Partial: hand-written `parents.includes` in `reservedFile` (1708), not `notAsSeen` |
| half-made pile folder after a failed note | drive-vault.ts:983 | None needed: the create's own answer, just read |
| late upload after its pile left | drive-vault.ts:1544 | None (the create's own answer); low |
| Undo of a Bin: `restore` → `fromBin` (unbin) | drive-vault.ts:453, 465, 466 | **No** |
| `restore` rename to a free name | drive-vault.ts:467 | No `stillAsSeen` (it acts on the untrash answer, so this is low) |
| Undo of a change: `Journal.removeNow` bins its record files | src/data/vault/journal.ts:505 | **No** (Bower's own `.bower` files) |
| `move` / `rename` / `updatePile` folder (control) | drive-vault.ts:326, 347, 1066 | Yes, `stillAsSeen` |
| runner/engine Bin (`w.trash` via the fenced writes) | src/data/spine/engine.ts:501,521; runner/src/spine/retention.ts:131-133 | Yes, `expectSeen` + `SeenFiles.assert` (src/data/drive/seen-files.ts:65) inside every fenced write |

## Why (5 whys)

1. Why was the filed pile binned? `toBin` sent `trash` without reading the target first.
2. Why no read? On the app path the check is an opt-in call. `DriveVault.stillAsSeen` (drive-vault.ts:1722) must be
   called by hand before `once`. `move`, `rename` and `updatePile` call it; `trash`, `removePile`, `restore` and the
   journal Undo do not.
3. Why opt-in? The app's single write funnel, `once` → `updateByStamp`, is the write-once mechanism. It answers "did my
   write land?" after a lost answer, not "is the target still as read?" before the send.
4. Why is the runner safe and the app not? `c1-still-as-seen` gave one predicate (`notAsSeen`,
   src/data/contracts/still-as-seen.ts:46). Its header (lines 9-11) says "a move, a rename or a Bin checks only the name
   and place it read". The runner and engine apply it structurally: `SeenFiles` sits inside the fenced write port, so no
   write can skip it. The app never got an equivalent point of application. Each `DriveVault` method places the call
   itself, and two methods still keep hand-written copies of the check (1078, 1708).
5. **Design cause:** the fence's home owns the comparison but not where it is applied on the app path. Nothing
   structural or machine-checked makes every app write of an existing file pass it. So Bins (and unbins) were never
   wired, and the only test that touches the case stubs the send away.

## Owner mechanism

"Still as seen" fence before an act, `src/data/contracts/` (`notAsSeen`). On the app side it is applied through
`DriveVault.stillAsSeen` and `DriveVault.once`; on the runner side through `SeenFiles` (src/data/drive/seen-files.ts).
Related, not the owner: write-once (`src/data/spine/write-once.ts`).

## Same class elsewhere: 7

Beyond the three reproduced `toBin` callers:

- drive-vault.ts:703: declaration copies binned unchecked.
- drive-vault.ts:1089: declaration copies binned unchecked.
- drive-vault.ts:1078/1112: a time-only hand check, a second copy of the fence.
- drive-vault.ts:1708: a `parents.includes` hand check, a second copy of the fence.
- drive-vault.ts:453/465/466: unbin unchecked.
- drive-vault.ts:467: rename on restore without `stillAsSeen`.
- journal.ts:505: Undo bins unchecked.

Adjacent (another defect): `transport-retry-skips-fence` (DEFECT_LOG:65). A pre-send check still leaves the 429 retry
window open.

## Options

**(a) Fix in the owner: `DriveVault.once` becomes the app's one fence point.**

- Before every send, `once` reads `f` by id, Bin included (`byId`, write-once.ts:63).
  - If the file already `holds(f, intent, now)`, it resolves as the person's own landed write. This keeps a second
    press after a lost answer working; without it, a re-pressed Bin would read `gone`.
  - Otherwise it refuses on `notAsSeen(seenPlace(f) [+ modifiedTime for text], now)`. For `unbin` it expects
    `trashed: true`.
- `stillAsSeen` (1722) and its three calls fold into `once`.
- The hand checks at 1078 and 1708 move onto `notAsSeen`.
- `trash` and `removePile` check the pile before binning its declaration copies, so a refused pile leaves its copies
  alone. Unverified whether binning a filed pile's copies is harmless.
- `Journal.removeNow` (journal.ts:505) is outside `once` and gets the same read-then-`notAsSeen`. To keep this from
  becoming a third copy, it should take the same helper exported from drive-vault or contracts.
- Size: S-M, about 40-70 lines in drive-vault.ts and journal.ts plus tests.
- Risk: low-medium.
  - One extra `files.get` per Bin; a pile removal costs 1 plus its copies.
  - The refusal sentence and copy are unchanged.
  - Lost-answer tests (3080-3110, 522-545) must stay green.

**(b) Refactor first, then fix: the app writes through the same fenced write port as the runner.**

- `DriveVault` and `Journal` send through a `FencedDrive` built on `SeenFiles` (`expectSeen` then the write).
- `once`, `stillAsSeen` and the hand checks are deleted, and one fence serves app, engine and runner.
- `SeenFiles` refuses a never-read file, and it leaves a folder's modifiedTime at `''`. Every app create, upload and
  text write would have to declare what it read.
- Size: L, touching every app write site, the upload queue's Drive and the live `bound` proxy.
- Risk: medium-high. Wide behaviour change on the person's own writes, with e2e churn. It also pairs naturally with the
  fix for `transport-retry-skips-fence`, where the per-retry check must live inside the port.

**(c) New mechanism:** not applicable; the fence exists. Rejected.

## Class regression test

Name: "every app write of an existing file refuses one that changed name or place elsewhere" (drive-vault.test.ts,
FakeDrive). It has two parts:

1. **Table-driven case.** For each `DriveVault` method that writes an existing file, list first, then move or rename the
   target directly in Drive, then act. The methods are `trash` (note, Inbox pile), `removePile`, `updatePile` (note Bin,
   lone→folder), `move`, `rename`, `restore` and the journal Undo.
   - Expect `notAsSeenReason(e)` to be one of `parents`/`name`/`gone`.
   - Expect `drive.snapshot()` to be unchanged.
2. **Guard over the whole suite.** A FakeDrive spy fails any `trash`/`untrash`/`update`/`writeText` on an id whose last
   operation was not a `get` of that id within the same vault call. This also catches future methods.

The repro above, three cases, is the red.
