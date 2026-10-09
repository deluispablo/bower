# v2-boot-states — d-v2-12

implementer: codex

tests changed: none

New tests are separate from the implementation and notes so the coordinator can commit the red, fix, and docs separately.
No git write commands, other worktrees, servers, network requests, check gates, or e2e runs were used.

## Change

`src/app/boot.ts` remains the boot's one home. One timer at 3000 ms replaces the old 3 s and 8 s timers.
It fills the status line with **Still opening** and “Your Drive is answering slowly. Bower keeps trying.”
It removes `land` and adds `read`, holding the existing neutral read still frame. The copied blink in
`index.html` keeps running; no read keyframes or new pose mechanism were added.

The initial line in `index.html` is empty. The opening class sets only the slow heading to 18 px,
weight 600, Source Sans 3; the existing muted body stays 15 px. Failure removes this opening class,
so offline keeps its existing copy, heading styling, sleep pose, and retry button styling.

The error copy is **Bower could not open**, followed by
“Something went wrong while opening. Your notes are safe in your Drive.” Its alarm pose replaces read.
`App.tsx` and its `bootFail` call were not changed. Retry still focuses, says “Trying…”, disables,
and invokes the callback after 300 ms.

Primary button choice: small boot CSS in `index.html`, using an error-only `primary` class.
The app's primary class is a CSS module and is not available before the app stylesheet loads.
The boot rule matches `src/ui/ui.module.css`: teal fill (#5fcfbc), dark text (#0b1220), pill corners,
48 px minimum height, 22 px horizontal padding, and 600 17 px/1.2 Source Sans 3.
It adds a 160 px minimum width, matching hover fill (#74d8c7) and disabled treatment;
the existing focus outline remains. Offline's button keeps its original styling.

All copy stays inside the existing `#boot` status region. Reduced motion keeps the existing
animation suppression; no new animation is introduced.

## Test evidence

New `src/app/boot.test.ts`, fake timers only:
- `one step at 3 s`
- `no 8 s step`
- `the bird gets the read class`
- `failure replaces read with alarm and focuses retry`
- `offline keeps its copy and sleep pose and cancels the status timer`
- `completion cancels the status timer`

Red: four assertion failures, two passes, before source edits. The failures showed two timers,
the 8 s replacement, the missing read class, and the old error heading.
Log: `/private/tmp/v2-boot-states-red.log`.
Green: all six tests pass. Log: `/private/tmp/v2-boot-states-unit.log`.
TypeScript app no-emit and targeted eslint pass. Logs:
`/private/tmp/v2-boot-states-tsc.log` and `/private/tmp/v2-boot-states-eslint.log`.

New `e2e/v2-boot-states.spec.ts`, with both exact names at 375 and 1440 px:
- `the boot says still opening after 3 s`
- `a failed boot says it could not open and offers try again`

The slow test uses `scenario=slow`, a controlled clock at 3.5 s, and deterministic demo latency.
It checks empty initial text, slow copy, heading metrics, read class, continued blink, reduced motion,
and shared axe scoped to `#boot`.
No existing generic failing-boot e2e path was found (the existing `start-fails` scenario fails a tidy-up start).
The synthetic test-only trigger aborts the demo world's module request, rejecting `buildSources` through
`main.tsx`'s existing boot failure handler. It adds no fake scenario or production trigger.
It checks error copy, alarm, focused retry, minimum width, retry feedback, and shared boot-scoped axe.
This failure test explicitly uses the demo source, including when the suite uses fake Drive.

E2e and `pnpm check` were not run, as instructed. Their results and designer verification remain for the coordinator.
The coordinator must replace `REDSHA` and `FIXSHA` in the compatibility rows after committing.

## Sources

- WAI-ARIA status role: https://www.w3.org/TR/wai-aria-1.2/#status
  Retain the status region for polite status updates; it has implicit polite live and atomic semantics.
- MDN `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
  Retain the existing reduce media query that disables boot animations.
- Local existing implementation: `src/ui/ui.module.css` for the primary button,
  `src/bird/poses.css` and the read reference in `src/bird/pose-reference.fixture.ts` for the still pose.

The official source URLs are cited as the established references; they were not fetched because this task has no network.

## Round 2 (e2e run for real)

Root cause: a test scoping error, not an app bug. The timer, `bootStart` and `bootDone` behave to the packet.
On the demo, `scenario=slow` keeps the boot up past 3.5 s (two sequential 1.5 s reads) and "Still opening" shows at 3 s.
On the pretend Drive (the second half of `e2e-both.sh`), `scenario=slow` opens in about 2.3 s of fake time (one 1.5 s answer),
so `bootDone` removes `#boot` before 3 s and "Still opening" cannot appear. Stepping the paused clock by 250 ms showed both timelines.
The earlier clock handling (install, mount, `pauseAt`, `runFor(3500)`) was sound; the three failures were this source difference.
The 3 s status step on any source stays covered by `src/app/boot.test.ts` (`one step at 3 s`, fake timers).

tests changed: e2e/v2-boot-states.spec.ts: the slow test skips on the fake source (`isFake`), with its reason; no assertion changed.

Green: v2-boot-states, app, robustness and qa5 on phone and desktop with axe; `pnpm check`.
Logs: `/tmp/boot-e2e5.log`, `/tmp/boot-verify.log`, `/tmp/boot-check.log`.
src unchanged in this round, so there is no new compatibility row.
