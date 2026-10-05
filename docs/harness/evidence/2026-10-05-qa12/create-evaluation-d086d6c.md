# Create-leading-dot independent evaluation

Status: STOPPED / UNAVAILABLE — focused browser evaluation NOT RUN. Coordinator stopped the bounded capability attempt; reservation released after this final handoff. The plan below remains unexecuted.

## Actual attempt and final handoff

- Granted frozen target: `d086d6cc3f3d157e560f169af81d200342f92157`; source unchanged from `28d2ce2359a940f2e2d25b4f58af04636dd15a7b`. Read-only startup refresh confirmed that HEAD and clean integration status, and read the matching live ACTIVE reservation before attempting browser access.
- Granted origin: `http://127.0.0.1:5192`; coordinator supplied verified listener PID 9281/cwd and owned server exec session 15034. Evaluator did not start, stop or alter the server.
- First CUA call: `cua.createBrowserTab("chrome", "http://127.0.0.1:5192/files/Resources/Cooking?source=fake&scenario=default&time=instant", {sessionName: "🧪 Bower creation"})`. Actual result: `Browser is not available: chrome`. No successful tab binding or page state returned.
- Second CUA call: `cua.getState()`. Actual result: enabled browser inventory `browsers: []`; native app inventory included running Google Chrome (`com.google.Chrome`). This proves native app discovery only, not browser interaction/viewport/console capability.
- Third CUA call: `cua.getApp('com.google.Chrome')`. Actual result: aborted by user after 363.5 seconds, with no usable UI state or app binding returned. The pending call prevented responding at a tool boundary to coordinator update/stop messages; no further native/browser actions were attempted.
- Actual supported viewport/console/screenshot controls: **not established**. No viewport, console, app page or screenshot was observed. No clicks, typing, navigation, browser keys, source/storage injection or evaluation flows occurred.
- Cleanup: no evaluator-owned tab was successfully created; no viewport setting was changed; no native UI action requiring reversal was issued. The getApp selection may have partially selected the existing app before interruption, but it did not include tab creation/input/viewport changes, and no returned state establishes a user-visible modification. No unrelated tabs/windows/processes were touched or closed. No new app/browser search or workaround attempted after stop.
- Reservation: **released**. Coordinator can stop its own preview and resume serialized browser work. Evaluator has no active browser/session operation.
- Result: all four source/size outcome cells remain NOT RUN, no product findings reproduced, no clean-console verdict, and no manual acceptance certification. Source/CLI evidence supplied by coordinator remains distinct from unavailable independent UI evidence.
- Repository/tests: no repository edits/Git mutations/tests/install/build/live-provider/model/delegation actions. Only this report outside the repository was updated.

Evaluator: Codex `/root/o2_probe_specs`, `p2-create-evaluation-2026-10-05`. Did not build the change. Planning: `2026-10-05-contracts-2`; P2; C03/C16; focused entry `create-leading-dot`. Broader acceptance journeys are excluded from this bounded entry and await a later repaired final target.

Startup observed clean integration `/Users/deluisp/Projects/bower-app`, branch `codex/close-phase-2`, HEAD `2f8d5c9e7fd5b6bb5a619dae713ef16e4828773c`; source candidate `28d2ce2359a940f2e2d25b4f58af04636dd15a7b`. Planning revision matches local main. Canonical bower-session and bower-evaluate plus evaluator brief, STARTUP, live ACTIVE, browser coordination rules and P2 acceptance loaded/refreshed. No source/repository edits, Git mutations, installations, builds, tests or live-service actions performed.

Preparation capability statement (superseded by actual attempt above): session tool catalog exposes `mcp__cua_repl.js` with documented entry APIs. Runtime browser availability was not proven during preparation. The actual browser surface was unavailable, and native app access did not return usable state. No separate automation stack was created. Port 5191 remained outside this evaluator's reservation; existing 5190 was untouched.

## Required coordinator grant

Exact full frozen SHA, build provenance from that target, preview origin/listener cwd, exclusive browser/session reservation, source/scenario scope, viewport sizes and freeze duration. Refresh live ACTIVE on receipt. Halt certification if target/build changes or the origin is unverified. Do not build or restart any server.

## Planned native browser procedure

After grant, initialize exactly one native API call for the dedicated assigned browser tab; read its returned browser documentation/state before any further call. Navigate only the granted origin and fake/demo synthetic data. Inspect fresh UI state after navigation/actions; use documented native APIs and UI-visible DOM evidence. Do not inject source/storage/state or call backend functions to manufacture outcomes.

Matrix: fake/default then demo/default, at 390×844 and 1440×900. Time=instant where granted. Each source/size uses a fresh dedicated evaluation page or the visible Demo panel's Start again/reset; do not clear unrelated storage. Capture exact viewport evidence, current URL, relevant screenshots/UI snapshots, focus and console before/after each flow. Source suffix must remain explicit in initial URLs: `/files/Resources/Cooking?source=fake&scenario=default&time=instant` and demo equivalent, subject to the granted origin.

### Phone — direct name-sheet creation (both sources)

1. Open Cooking folder, confirm visible main heading Cooking and boot settled. Open `More for Cooking` → `New note` → textbox `Name`; submit `.Garden.md` with `Make the note`.
2. Expect readable status `A name cannot start with a dot.`, Cooking URL/heading preserved, no `Not here any more` page, and name sheet closed by its existing lifecycle. Capture refusal screen/URL/focus and console diagnostic. List should have no hidden created note observable from UI; data-level no-write proof remains separate CLI/source evidence.
3. Reopen More → New note, enter a unique ordinary dotted stem such as `Garden.2026.Phone`, submit. Expect `/note/Resources/Cooking/Garden.2026.Phone.md`, plain heading `Garden.2026.Phone`, usable page and working return to Cooking. Revisit from folder list to confirm destination exists.
4. Repeat `New folder` with `.Garden`, expect the same refusal/original destination; reopen and create `Garden.2026.Phone.folder`. Expect `/files/Resources/Cooking/Garden.2026.Phone.folder`, full dotted-folder heading and working navigation. Revisit from Cooking list.
5. Where the visible controls allow, repeat padded `  .Garden  ` rejection and Enter submission/recovery. Record whether focus returns to a usable control after the sheet closes, and whether no horizontal clipping hides status/actions at 390×844.

### Desktop — supported named creation and inline retry (both sources)

1. Through Resources tree context menu, create a temporary empty synthetic folder `Evaluation.2026` with ordinary naming; open its list using `Open as a list or table`. Click `New note in Evaluation.2026` to open the named creation form.
2. Enter `.Garden` in `Name of the note`, submit `Make the note`; expect readable leading-dot refusal, unchanged empty-folder URL/heading, no missing-page navigation and usable form. This form's existing lifecycle keeps it open on failure. Retry directly with `Garden.2026.Desktop`; expect its actual note page/heading and revisit from the folder list.
3. Cooking tree context menu → New note / New folder creates an ordinary default item and opens inline naming. Try `.Garden` and Enter; expect readable refusal and editable text retained. Retry `Garden.2026.Desktop.note` or `Garden.2026.Desktop.folder`; verify actual note/folder destination and full stem. Use keyboard Enter/F2/Escape where supported and record focus recovery.
4. Desktop inline flow is a rename refusal after default creation, not proof that a hidden named folder was refused before the initial default write. Direct named-folder source creation is certified by phone UI plus separate source/CLI proof. State this limitation explicitly rather than call every desktop case identical to the phone creation path.

Expected console: BowerError/conflict with `A name cannot start with a dot.` from the documented error reporter on intentional refusals. Record each expected diagnostic separately; no unexpected warnings/errors allowed. Console absence/retrieval failure is a limitation, not proof of a clean console. Unrelated failed network loads, uncaught exceptions or post-success errors are findings.

## Execution results (pending)

| Source | Scenario | Viewport | Note refusal/retry/revisit | Folder refusal/retry/revisit | Console | Screens/URLs |
| --- | --- | --- | --- | --- | --- | --- |
| fake | default | 390×844 | NOT RUN | NOT RUN | NOT RUN | none |
| demo | default | 390×844 | NOT RUN | NOT RUN | NOT RUN | none |
| fake | default | 1440×900 | NOT RUN | NOT RUN | NOT RUN | none |
| demo | default | 1440×900 | NOT RUN | NOT RUN | NOT RUN | none |

Each finding will name severity, source/scenario/size, exact steps, actual/expected result, console text and target SHA. Screenshots saved only outside the repository through documented tool mechanisms. Finish by closing only evaluator-owned tabs and restoring any evaluator-changed viewport as appropriate. Do not edit backlog/proofs or certify broader C03/C16/P2 acceptance from this focused result.
