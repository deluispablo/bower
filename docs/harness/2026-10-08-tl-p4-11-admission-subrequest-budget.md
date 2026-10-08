# Technical-lead decision TL-P4-11: admission keeps to a subrequest budget

**Found live, 2026-10-08, on `ba74598`.** Every press of Tidy up got 500 from `POST /process`, and no run was created. The Worker log for the press at 13:38:15Z shows:
- `Error: Too many subrequests by single Worker invocation`;
- then `An admission read ahead failed` / "Google Drive didn't answer";
- then the 500.

On the free plan a Worker invocation may make 50 subrequests ([Cloudflare Workers limits, subrequests](https://developers.cloudflare.com/workers/platform/limits/#subrequests)). Admission reads ahead the files the plan will read (TL-P4-04), and the staging folder now holds more files: the reset outputs, both hubs and 3 old pile notes left in the inbox. So the read-ahead outgrew the limit. The owner's real folder at the cutover is far larger, so this would fail in production on the first press. The owner rule is free tiers only, so the fix is a budget, not a paid plan.

**Ruling:**
1. **`admission-subrequest-budget`** (`bower-implementer`), first, before any live check.
   - Admission counts its subrequests (token refresh, listing pages, read-ahead, dispatch) and keeps under a fixed budget of 35, leaving room under the 50.
   - The read-ahead takes only what fits. The runner reads the rest, which it already can; nothing is lost and only speed changes.
   - A listing that alone would exceed the budget stops reading ahead, and admission continues on what it has, without the read-ahead.
   - Test: on the fake, a folder of 300 files with 25 piles is admitted within the budget, counted per call, and the run's outcome equals the unbudgeted one.
2. **`process-error-honest`** (`bower-implementer`, small).
   - When `/process` fails, the sheet shows the one-sentence error and a way to try again. It never stays on "Starting…".
   - The 500 itself becomes a `BowerError` with a short sentence, and its details go to `console.error`.
   - Test: a 500 from `/process` shows the sentence within the e2e.
3. **Live staging setup.** Before the next live runs, the coordinator bins the 3 old pile notes left in the inbox, so offer-and-flat runs on its own corpus start.
4. **Then** the same live check as planned: offer-and-flat ×3, garden ×1 and c05-hub-lines ×2.
