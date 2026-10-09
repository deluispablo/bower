# Packet: P4-55 review (c4-retry-fence, escalated, data safety)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-retry`.

## What to review

- **Diff:** `git diff baaa781b38f9dc2e16dc69a7a38133e4acb60b05..c4-retry-fence`. Red a6ea6210, fix 9d193972, notes 22cff4b0.
- **Packet:** `docs/harness/2026-10-09-c4-retry-fence-packet.md` (contract per TL-P4-24 addendum 2). Defect `transport-retry-skips-fence`; the Codex finding is `docs/harness/2026-10-09-codex-p3-review.md` finding 1.
- **Context:** c4-app-fence is merged. The one landed definition lives in `spine/write-once.ts`, and `checkStillAsSeen` lives in `contracts/still-as-seen.ts`.
- **Fixed questions (TL-P4-20):** contract first, then a second way: a second retry path, a second fence, or a refresh inside the fence. Give every finding a severity.

## Look hardest at

- **The retry stays in its one home,** the transport send. A `fence: () => Promise<void>` on existing-file writes (writeText, update, trash, untrash, multipart PATCH) is awaited before each resend after a 429, a 403 rate limit or a 401 refresh, and never before the first send. `raw()` is unchanged.
- **A throwing fence** ends the call with the caller's own not-as-seen error, and nothing is resent.
- **An unfenced write** is sent once, then fails retry-kind. The notes name two app callers that now lose their resend:
  - `spine/barrier.ts:193` (write by stamp);
  - `vault/journal.ts:509` (Undo's Bin by stamp).
  - Is that a regression a person would see (Undo failing under a burst) that the contract's point 4 ("every fenced caller passes its fence") required to be fenced? Judge it, and give its severity.
- **Creates by reserved id** keep their resend. Creates without an id: say what they do now.
- **Every fenced caller passes its fence:**
  - the app's `once`, through `checkStillAsSeen`;
  - the runner's fenced writes, with the attempt check before the resend;
  - the Worker's `replaceText` (`api/src/vault.ts`).
  - Is any other caller that can hit a 429 left unfenced?
- **The 401 row** keeps the refresh path. There are entry-point tests for app move/rename, runner `main` and the Worker route.
- **Housekeeping:** the goldens (C04 78, 25-runs 88) do not rise; `tests changed:` lines are present; no `.only`/`.skip`; no real timers.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
