# Defect new-folder-first-letters: diagnosis

Log: DEFECT_LOG.md (claude/p3) line 98. Diagnoser: read-only, 2026-10-10. Branch c5-remove-new-note at 668f8ce9.

## What failed

e2e `qa7.spec.ts:63` "New folder from the tree keeps the first letters typed" (desktop, `source=fake`): right-click Resources,
menu New folder, `keyboard.type('Garden plans')` with no wait, Enter. I reproduced it on the branch with
`with-lock.sh … --repeat-each 20 --project=desktop`: **9/20 failed**. They fail in two ways:
- 7/20: **the whole name is lost**. The row "New folder" still has its box showing "New folder". The main view is "Resources"
  and Resources is selected. So Enter reached the tree's own Enter (Explorer.tsx:211-215, `activate`), not the box.
  The coordinator's /tmp/rnn-qa7-results repeat2 snapshot is the same.
- 2/20: **the first letter is lost**. The row is "arden plans". "G" went to the tree, the rest went into the box.
The coordinator measured a base rate of 1/20 on claude/p3. That is **unverified**: the test does not exist on claude/p3
(`git grep` finds no match), and the notes do not say how base was run.

## Why (5 whys)

1. Why was the name lost? The keys were delivered while focus was on the tree (`role="tree"`, Explorer.tsx:493-500).
   `onKey` treats a printable key as type-ahead (Explorer.tsx:217-226) and Enter as `activate` (211-215). Only keys
   whose target is an INPUT are skipped (Explorer.tsx:172).
2. Why was focus on the tree? The menu item's `beforeRun` focuses the tree (Explorer.tsx:527). The menu's close handler
   focuses it again because `renaming` is still null (Explorer.tsx:516-522). The name box focuses itself only when it
   mounts (`autoFocus`, Explorer.tsx:556).
3. Why does the box mount late? `act.create` first runs `await vault.create(folder, 'folder')` and only then sets
   `justMade`/`renaming` (file-actions.ts:121-128). On fake and real, `DriveVault.create` (drive-vault.ts:366-383) waits
   for three things: the Drive create (`intended.make`), then `journal.record`, then `emit`. `journal.record` takes the
   cross-tab Web Lock and waits for the send to the Worker (journal.ts:267, 291, 342-346). That takes several tasks on
   fake and network round trips on real Drive.
4. Why does the wait matter? The flow is **create first, then name**. The thing the person types into exists only after
   a Drive write and a Worker send. During that time nothing owns the keys meant for it.
5. Why was this not caught? It was treated as a speed problem before. create-name-speed (qa-9) was fixed by
   26549614 ("no cross-tab lock when nothing waits"). 4953b1ae (c4-undo-compensate, "record appends under the lock and
   awaits the one drain") undid that, as its design required. This is the second time the class has shown up, so by
   DEFECTS step 6 it should become a base-improvement entry. **Design cause:** the tree names a new folder *after*
   creating it, while NameSheet (NameSheet.tsx:32-52) asks for the name *first* and then calls
   `vault.create(folder, 'folder', name)`. The app has two orders for one act.

**Why the branch fails more (unverified).** On the path from the menu click to the box mounting, the src diff changes
only the menu items (New note removed, Explorer.tsx:600) and the removal of `useNavigate` from Explorer. Neither adds
work before the box mounts. The two failure modes, one letter or the whole name, point to `create` sometimes waiting
behind other journal or lock work. I did not measure this. The root cause and the fix are the same on both branches.

## Standard pattern

Name first, then create. VS Code's explorer `openExplorerAndCreate` adds an in-memory `NewExplorerItem` and opens its
name box (`setEditable`) in the same action. Nothing is created until `onFinish` succeeds
([fileActions.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.ts)).
The field exists before any await, so no key can be lost.

## Owner mechanism

No row of the mechanism map covers "naming a new thing". In practice its home is the one naming flow: `ui-store`
`naming: {folder, type:'folder'}` together with NameSheet's save (`vault.create(folder,'folder',name)`). The tree runs a
second flow: `act.create`, then `justMade`, then RenameInput, then `act.rename`, or `act.discard` on Escape. The focus
hand-off belongs to "Focus return" (`src/ui/focus.ts`, plus the tree-menu rule at Explorer.tsx:516-522). That part works
as designed. The lead should add a map row: "Naming a new thing: name first, one create with the name".

## Same class elsewhere (2)

- Explorer.tsx:431: the header button "New folder" calls `act.create(targetFolder())`. The window is the same, and focus
  stays on the button, so letters are lost. A typed Space also presses that button, which would make a second folder.
  **Unverified, no run.**
- file-actions.ts:129-133: when a create fails but was applied, the box mounts even later, after the refusal.

## Options (the lead rules; the designer is consulted, since focus, Escape and blur change)

- **(a) Fix in the owner, medium, medium risk.** The tree's New folder (row menu and header) sets the existing `naming`
  state synchronously. Explorer draws a pending name row under that folder and opens the folder (like VS Code). Enter
  calls the same named create NameSheet uses. Remove create-then-rename: `act.create`, `justMade`, `act.discard`, the
  `quiet`/partial branch. Escape then writes nothing (no create plus Bin). Risks: a pending row outside `vault.tree()`;
  blur semantics, which the designer decides; e2e tests that expect an immediate "New folder" row (qa6 Escape).
- **(b) Refactor first, then fix, two small entries, low risk each.** First move NameSheet's create part
  (NameSheet.tsx:43-51) into one `file-actions` `createNamed(folder, name)`. NameSheet uses it, with no behaviour change.
  Then do (a) on top of it. This is the recommended path.
- **(c) New mechanism, small, high risk, not recommended.** A keystroke buffer: while a create is pending, the tree routes
  keys into the RenameInput `draft` and replays Enter. That is a second input path. Backspace, paste, IME and arrows
  would need copies of what an input already does. The window stays unbounded on real Drive. A speed fix like 26549614
  is not an option either: it already regressed once, and a network round trip still leaves the window open.

## Class regression test

Unit test (vitest + testing-library, as in file-actions.test.tsx:58) with a `vault.create` that never resolves. For
every inline entry point that names a new thing (row menu New folder, header New folder), check right after the click,
with no await: a focused name box exists. Then type "Garden plans" and Enter, resolve, and assert one call
`create('Resources','folder','Garden plans')`. Keep qa7:63 as the live e2e guard.
