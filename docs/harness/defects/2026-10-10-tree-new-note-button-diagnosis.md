# Diagnosis: `tree-new-note-button`

**Finding:** this matches the toolbar control removed by c5, but it is absent from `2ab7b490`. The checkout evidence does **not** establish an implementation miss; it points to older browser code or a served-build mismatch.

## Component and action

Historical references below use revision `9040d9bf^`.

- `src/features/files/Explorer.tsx:434–436` renders the `IconButton` labelled “New note”, immediately before “New folder”.
- `src/ui/Button.tsx:32` turns its label into `aria-label` and `title`, explaining the observed accessible button name.
- Its click calls `act.create(targetFolder(), 'note')`.
- `Explorer.tsx:146–149` chooses the selected folder, otherwise the open note’s parent, otherwise Resources; Inbox also falls back to Resources.
- `src/features/files/file-actions.ts:121–127` calls `vault.create`, expands ancestors, and starts inline naming after creation.
- `Explorer.tsx:86–89,408–412` then opens the named note and shows the creation toast.
- This creates a note; it does not invoke the `/add` flow.

## Removal evidence

- `docs/harness/DECISIONS.md:381` explicitly names this explorer button in TL-P4-35: remove New note everywhere; retain New folder.
- Red commit `3cc13c38` adds the absence checks.
- Fix commit `9040d9bf` deletes this exact toolbar button, the row-menu action, and the `newNote` icon.
- Integration commit `02d6adae` merges c5. `git merge-base --is-ancestor 9040d9bf 2ab7b490` succeeds.
- At **`2ab7b490`**, `Explorer.tsx:419–427` starts the toolbar with **New folder**; `:521–523` renders that shared header. No New note label remains in this component.
- The local `dist/assets` also contains no exact New note button label. This does not prove which assets staging served.

## Why the e2e can pass

- `e2e/no-new-note.spec.ts:12–18` visits `/files` at **1280 and 375 px**, then checks labels and text across the page.
- `:22–47` additionally checks the folder menu and an empty folder page.
- It does not visit `/add`, use 1024 px, or exercise retained staging browser state.
- Nevertheless, the historical toolbar button is shared: `DesktopShell.tsx:160` mounts `Explorer variant="panel"` independently of the page route.
- Both 1024 and 1280 use the desktop shell (`src/ui/media.ts:4`). Fresh defaults open the Files panel (`src/app/prefs.ts:38–41`, `src/app/ui-store.ts:116`).
- Therefore the existing desktop assertion **would catch the old button** with that panel mounted. Route or viewport differences alone do not explain this observation.
- The test runs against local development code (`playwright.config.ts:5`), not staging’s served/cached assets.
- Shell precaching is configured in `vite.config.ts:15–17,32–35`. `/health` reports the Worker’s version (`api/src/index.ts:38`), not the executing browser bundle’s identity.

## Root cause and options

**Established:** the observation contradicts the source at the stated SHA.  
**Unresolved:** an old open tab/service-worker shell versus incorrectly served assets. Neither can be distinguished by checkout-only reads.

- **(a) Recommended:** verify browser asset identity against the build from `2ab7b490`, using a fresh browser context and the existing context. Correct the delivery/update mismatch if confirmed.
- **(b)** Extend the existing guard to `/add` at 1024 px with the Files panel explicitly open; include the production artifact in verification. Remove code only if the actual served revision reveals a surviving control.

If such a surviving control is confirmed, removing it restores **TL-P4-35(1)**. It qualifies for the approved-spec restoration exception in **TL-P4-40(3)** (`DECISIONS.md:440`); the owner is informed.

## Red through the screen

At 1024×900, open `/add?scenario=default&time=instant` with made-up demo/fake data; open the side panel if folded and select Files. First assert the tree and New folder button are visible, then assert zero buttons named exactly “New note” and retain the existing label/text checks.

That assertion should fail on the observed old screen and pass on `2ab7b490`. **Proposed red, not executed:** no files changed, server started, or network used.
