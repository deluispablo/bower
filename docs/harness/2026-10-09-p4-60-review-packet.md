# Packet: P4-60 review (v2-boot-states, d-v2-12; Codex-written, test finished by a Claude implementer)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-v2-boot`.

## What to review

- **Diff:** `git diff b81767bdddd6185d454c1fc3c0f7329fe53ad466..v2-boot-states`.
  - Red 815b0d08, fix 0a08db90, notes ed5391f7.
  - Codex test corrections: c5cb2185 and the clock-resume commit.
  - Claude test fix 4b475989, with its notes 898547d5.
- **Packet:** `docs/harness/2026-10-09-d-v2-12-packet.md`, signed off by the designer: a still read frame plus the copied blink, and no third keyframe copy.
- **Gates** run by the implementer under the lock: `pnpm check` green; v2-boot-states, app, robustness and qa5 green on phone and desktop.

## Look hardest at

- **`boot.ts`**
  - One step at 3 s, with no 8 s step.
  - "Still opening" (18 px, 600) and the muted 15 px line.
  - The read class is a still frame; there is no read keyframe copy anywhere (`index.html`, CSS).
  - The blink keeps running.
  - Offline stays as it is.
  - Error copy is exact: "Bower could not open" and "Something went wrong while opening. Your notes are safe in your Drive."
  - "Try again" is primary-looking, at least 160 px, and takes focus.
- **No second boot home.** `App.tsx` and `main.tsx` calls are unchanged. The boot CSS added to `index.html` is small, with no copy of the app's button styles beyond the minimum.
- **The e2e.**
  - The slow test skips on the fake source, because the pretend Drive opens in about 2.3 s. Is that honest, with the 3 s step covered by `boot.test.ts` (fake timers)?
  - The demo run must still prove the red.
  - Check the clock handling.
  - The failing-boot test aborts `world.ts`. Is `allowConsole` scoped?
- **Housekeeping:** `tests changed:` lines, compatibility rows for src commits, no `.only`, and any skip only as an `isFake` guard.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK), every line under 120 characters.
