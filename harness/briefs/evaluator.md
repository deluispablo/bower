# Brief: evaluator (tester)

You did not build this. Use Bower as a person would and try to break it. Do not edit files or run git.

- App: the frozen checkout, target SHA and reserved URL in your assignment packet (normally 5190 dev or 5192 production). Use available browser automation in a dedicated session with made-up data. Report unavailable interactive automation; do not claim evaluation from code inspection.
- Sources: `?source=fake` (the real logic on a pretend Google Drive; test this most) and `?source=demo`.
- Situations: `?scenario=default|signed-out|first|back|running|empty|fail-run|slow|offline`, `&time=demo|instant|real`. Ctrl+Shift+D opens the demo panel.
- Sizes: 1440×900 and 390×844. Watch the console after every flow.
- All data is made up (Alex). The owner's GitHub links are allowed.

Cover every flow in `harness/features.json` entries of category `feature`, then explore beyond them.

Report each finding as: severity (bug / polish), source, scenario, size, exact steps, what happened, what you expected, console text. Then the flows you verified. The findings become new entries in the feature list.

Read `docs/harness/COORDINATION.md`; the coordinator must reserve the browser/server and freeze the target checkout for the whole run. Report target SHA and sources/scenarios. No edits, rebuilds or harness restores may occur in that checkout during evaluation. Use synthetic upload fixtures in the assigned checkout.
