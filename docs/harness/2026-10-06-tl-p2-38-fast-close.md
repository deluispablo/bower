# Technical-lead decision TL-P2-2026-10-06-38: closing P2 fast

**Owner ruling, 2026-10-06:** "Sí, apruébalo y aplícalo así, pero quiero que sea más rápido aún" ("Yes, approve it and apply it, but make it even faster"). The owner also told the coordinator not to run so many subagents, because they overload the owner's computer.

This decision narrows P2's exit to what the simulated app can honestly prove. It moves real-service and real-model evidence to the phase that can produce it. It overrides P2_ACCEPTANCE, WORK_PLAN and earlier TL decisions wherever they differ. Revision stays `2026-10-05-contracts-2`.

## 1. What P2 must still prove

| Rows | P2 exit now requires | Moved to |
| --- | --- | --- |
| C01–C03, C12, C14, C16 | What exists, plus the open entries below | — |
| C02 | Uploads kept across a reload, and reselection (both done or in flight) | — |
| C04–C11 | **One scripted journey per capability.** The app asks, the fake runner persists a real effect, and the app shows it and links to it. Recovery of these runs is the shared B-path recovery that O4 already built. | Per-capability fault depth → P4, with Claude |
| C13 Undo of a tidy-up | Not required. Existing Undo of a single move and restore from the Bin stay. | P4 |
| C15 preparation | Not required beyond what exists | P4, with the real model and extractor |
| R2–R4 real-provider probes | Not required (R1 was settled by owner ruling) | P3, on the agreed staging |
| O7 quality and performance corpus | Not required | P4 |

## 2. Cut the open work

- **The seven entries from TL-P2-37 shrink to two:**
  - **`b-path-asked-question`**, which keeps a capability.
  - **`legacy-runner-write-removal`.** It removes the legacy write path. Any plan the B path cannot take holds that pile, with "Bower couldn't tidy this up yet. Try again." and Try again. A race clears on the next run, and nothing is sent down the old path.

  This replaces `b-path-one-snapshot`, `b-path-capture-reads`, `b-path-capture-holds`, `b-plan-guard-refusal` and `running-scenario-on-b`. Those not yet started are closed as superseded by TL-P2-38 (METHOD: `passes: true`, a note, and the pinned behaviour tested inside the removal entry). Work already delivered and clean is integrated, not thrown away.
- **Finish what is already in review,** then stop adding hardening to the fake runner. It is replaced in P3 and P4, while its contracts carry over.
- **New P2 entries only for:**
  - a Critical or Important defect that loses data or breaks a primary journey;
  - one scripted journey per capability for C04–C11. These rows still lack one, C07, C08 and C09 above all.
- **Everything else** goes to a single `P2 polish` list in HANDOFF: Minor findings, copy niggles and rare races. That list never blocks closure.

## 3. A faster method for P2

- **Reviews.** One review per entry, plus at most one delta review of the changed lines. Only Critical and Important findings block. "Important" means something a person would notice, or a data risk; a theoretical gap is not enough.
- **Gates.** Each entry runs `pnpm check` and only the e2e tests of the screens it touches. The full `pnpm e2e`, `pnpm e2e:fake` and `pnpm e2e:pwa` run once per integration batch and at the final freeze. This changes METHOD step 4 and AGENTS' gate line for P2.
- **Machine load.** At most **two** workers at once, plus the coordinator. Reviews run one at a time. Heavy gates never overlap, and nothing runs while the display sleeps.
- **Questions to the lead.** Use the simplest-approach rule (TL-P2-28) and the coordinator's own judgment. Bring the lead only real product or contract choices.

## 4. Closing

1. Freeze one SHA, after the open entries and the C04–C11 journeys are done.
2. Run one independent review and one phone and desktop evaluation, in sequence, on that SHA.
3. Fix their Critical and Important findings once, and rerun only the affected checks.
4. The coordinator records the dossier and closes P2 under GOVERNANCE's conditional acceptance.
