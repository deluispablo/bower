# App redesign, design sources

The approved redesign (Obsidian-like look, the bird as mascot, every screen), audited and revised on 28 Sep 2026, lives in three places:

| What | Where |
| --- | --- |
| The decision record | [`docs/superpowers/specs/2026-09-27-app-redesign-design.md`](../superpowers/specs/2026-09-27-app-redesign-design.md), §14 for the revision |
| The delivery plan | [`docs/superpowers/plans/2026-09-27-app-redesign.md`](../superpowers/plans/2026-09-27-app-redesign.md) and the milestones M6 to M10, then M15 to M17 |
| The screens | `screens/*.dc.html`: 58 boards, the same files that make up the lead's private review canvas |

## The screens

Each board is a self-contained HTML page: open it in a browser to see it at real size, with the bird moving. `screens/canvas.json` is the layout of the review canvas (position, size and title of every board, row titles). The rows: the audit and the notes for development; the first visit (the What is Bower intro, sign in, first run); every day on the phone; settings, edge states and the tablet; the desktop; what Bower is, what it is not, one use case per PARA letter; brand, logo, mascot and the README section.

Two boards are the plan: `Audit.dc.html` (what was wrong, the fix, the severity) and `Dev-Notes.dc.html` (the issues of M15 to M17 and the ideas not asked for). Every issue in those milestones names the boards it implements.

`gen.py` holds one bird drawing (`BIRD_CORE`), one stylesheet (`CSS`, every pose as CSS keyframes) and one function per app screen. It generates 28 of the 58 boards: sign in, first run, the tour, Home, the drawer, the switcher, note, Add, Tell, the working sheet, offline, done, settings, health, privacy, not found, the push prompt, the desktop screens, the mascot, the brand and the logo sheets. Run `python3 docs/design/gen.py` after editing it; never edit those files under `screens/` by hand. It reads positions from `canvas.json` and only refreshes the boards it writes. The one exception in rendering is `Mascot.dc.html`, whose grid is filled from data and shows raw `{{item.name}}` placeholders outside the canvas runtime.

The other 30 boards (the intro pages, the Folder screen, the pin sheets, Add from your Drive, the tablet boards, the welcome page and the use cases, the audit and the notes) are committed as generated files. Their generators are the lead's canvas scripts, built on the same drawing and stylesheet; folding them into `gen.py` is a chore for when the boards settle. Until then they are edited by regenerating on the canvas and committing the result.

## The bird for the README and GitHub

`python3 docs/design/assets.py` writes `docs/assets/logo.svg`, `hero.svg`, `why.svg`, `how-it-works.svg` and `social-preview.svg` from the same drawing, each with its animation inside the SVG so GitHub plays it in an `<img>`. Text in them uses the system sans-serif (an SVG in an `<img>` cannot load a web font). The app's own icons (`app/public/`) come from `scripts/brand/build.py`, which holds the same drawing without its props. The static PNG logo for Google's consent screen (`docs/assets/logo-120.png`) is rendered from `app/public/logo.svg` (#213).
