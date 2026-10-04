# Progress

- 2026-10-04: harness set up for phase 2 (plan `docs/superpowers/plans/2026-10-04-phase-2-app-logic.md`); contract suite green on the demo.
- 2026-10-04: note-format passes: notes round-trip through Markdown with Bower's sections kept apart.
- 2026-10-04: drive-fake passes: FakeDrive meets the Drive contract (Bin, conflicts, same names, full text).
- 2026-10-04: drive-http passes: paging, parent batches, one token refresh, retries, resumable uploads, conflict check.
- 2026-10-04: layout-seed passes: Alex's folder is written into the fake Drive from the demo's own state, per scenario.
- 2026-10-04: vault-index passes: paths over Drive ids, same-name and case-only siblings kept apart, new-until-opened per device.
- 2026-10-04: vault-files passes: the file groups of the vault contract (move, rename, Bin, restore, tasks, journal, search) pass on Drive; inbox, bower and tidy groups still skipped.
- 2026-10-04: vault-inbox passes: piles (folder, lone, note-only, links, uploads with failures), rules, requests, questions and suggestions on Drive; the whole contract but the tidy-up group passes on the fake Drive.
- 2026-10-04: add-files passes: Add sends files and links themselves; after a reload a file asks to be added again.
- 2026-10-04: worker passes: the Worker contract is written; WorkerHttp, FakeWorker and the fake runner (filing, rules, requests, answers, journal archive, new marks) are tested.
- 2026-10-04: live passes: session and runs over the Worker; the whole vault contract, tidy-up included, passes on the fake Drive (27/27).
- 2026-10-04: source-switch passes: ?source=fake runs the real logic on a seeded fake Drive in the browser; VITE_API_URL makes the app real; the demo panel switches between demo and fake.
- 2026-10-04: e2e-fake passes: the whole e2e suite runs on the demo (56 passed) and on the fake Drive (54 passed; the sample-pile test is demo-only on both devices).
- 2026-10-04: duplicates passes: Add warns about a file you already have (by content on Drive, by name in the demo); things that did not arrive can be sent again, only those.
- 2026-10-04: pwa passes: the built app has a manifest, PNG icons and a precache-only service worker; it opens with no network.
- 2026-10-04: phase 2 done: 14/14 features; pnpm check, e2e (58), e2e:fake (56, sample piles demo-only) and e2e:pwa (3) green.
- 2026-10-04: harness method written (docs/harness/METHOD.md, AGENTS.md, briefs, architecture sensor); QA round 5 findings (20 bugs, 13 polish, 14 review) added to features.json; fixing them before phase 3.
