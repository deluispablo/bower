# Packet: P3 re-freeze review (rules template, deploy script lines)

Starting model: `bower-escalated` (Opus), fresh and read-only. This is a short delta review at the re-freeze (TL-P3-27 addendum). The previous freeze review passed at da34905. Counters: read only this packet, the packets below and the diffs, never workers' deliveries.

- **Diffs:** `git diff da34905..<frozen SHA in your prompt> -- src api runner scripts`. Per change:
  - `8f74a46`: `rules-template-bower`. The red tests are in `5c203da`; `426378c` adds a compatibility row.
  - `dab6b02`'s successors: `92c13d6`, `deploy-staging-upload-line`.
  - The coordinator's 30 s test timeout.
- **Contracts:** the TL-P3-27 addendum, and the packets `2026-10-07-p3-22-rules-template-packet.md` and `2026-10-07-p3-21-upload-line-packet.md`.
- **Look hardest at:**
  - **Rules template.**
    - Are the real `Rules.md` bytes and properties identical to the fake's?
    - The one-time repair runs at every `POST /vault`. Can it ever touch a `Rules.md` that the person edited, or the original app's plain file?
    - Is it fenced, and is it still-as-seen?
    - What does it cost: one list per `POST /vault`?
    - Can it race a run that is writing `Rules.md`?
    - Does a rule typed in the app now get worded on the real adapter?
  - **Upload line.** Is only `^Uploaded <name> \(` taken as the Worker upload line? Does `Uploaded bower-api (` give the production alarm?
- **Run:** single test files only, one at a time. Never run the scripts outside their stubbed tests, `wrangler`, `gh` or any network call.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters (TL-P3-29).
