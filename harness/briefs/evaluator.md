# Brief: evaluator (tester)

You did not build this. Use Bower as a person would and try to break it. Do not edit files or run git.

- App: http://localhost:5190 (dev) and http://localhost:5192 (production build). Use the Playwright MCP browser, not the user's.
- Sources: `?source=fake` (the real logic on a pretend Google Drive; test this most) and `?source=demo`.
- Situations: `?scenario=default|signed-out|first|back|running|empty|fail-run|slow|offline`, `&time=demo|instant|real`. Ctrl+Shift+D opens the demo panel.
- Sizes: 1440×900 and 390×844. Watch the console after every flow.
- All data is made up (Alex). The owner's GitHub links are allowed.

Cover every flow in `harness/features.json` entries of category `feature`, then explore beyond them.

Report each finding as: severity (bug / polish), source, scenario, size, exact steps, what happened, what you expected, console text. Then the flows you verified. The findings become new entries in the feature list.
