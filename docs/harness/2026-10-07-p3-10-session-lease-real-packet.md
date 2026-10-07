# Packet: session-lease-real (C14 staging journey, P3-10)

Starting model: `bower-evaluator` (Sonnet). Reason: the real session lease, judged as a person uses it on staging (P3_ACCEPTANCE C14; TL-P2-13/14/24/25, TL-P3-14).

- **Where:** the staging origin (in your prompt only), real source, in the **built-in browser pane** only, as test account A, who is already signed in. Open every tab with `?source=real`, because a plain new tab opens the demo. Don't clear site data, sign in or sign out; on a 401 from `/me`, stop. Never act on Google's pages. **Never use "Delete my account".**
- **Record first:** the bundle name and the `/health` version.
- **Journeys** (each: expected vs actual, with the `/session` answers `{active, epoch}` and any 409s from the network log):
  1. **Holding.** Tab 1 works normally. A reload keeps the place silently with the same epoch.
  2. **Asking.** Tab 2 shows "Bower is open in another window." with "Use here", and it makes no Drive write and no `/process` call.
  3. **Taking over.** In tab 2, press "Use here". Tab 2 works, with a higher epoch. Tab 1 now shows the block screen with its own "Use here" and stops polling `/status`.
  4. **Fence.** From tab 1 (blocked), by page script, call `POST /vault` with tab 1's old place and epoch headers. Expect 409 `stale-session`. Do not call `/process`, because it would admit a run.
  5. **Leaving.** Close tab 2, which sends `leave` on `pagehide` with keepalive; check the network log if it's visible. Back in tab 1, press "Use here", or reload: it takes the lease (a higher epoch, since tab 2 held it).
  6. **Expiry nobody took.** Skip the 3-minute wait unless time allows. If you run it: leave tab 1 idle for more than 3 minutes with no other tab, then use it. It continues with the same epoch and no block screen (TL-P2-25).
  7. **External change while open.** By page script with `GET /drive/token`, rename one note inside the probe folder. Its id is in your prompt; rename only inside that folder. Return to the app (focus or visibility change). The new name shows without a full reload. Then rename it back.
- **Console:** any error that isn't from an older bundle is a finding.
- **Never:** write to Drive outside the probe folder, run a tidy-up, delete anything, or press "Use here" more often than the steps say.
- **Reply:** the evaluation card in `docs/harness/WORKER.md`. Cells are the journeys 1–7; notes go to `/private/tmp/p3-10-lease/notes.md`.
