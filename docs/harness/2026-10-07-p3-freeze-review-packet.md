# Packet: P3 freeze review (P3-19 and P3-20: deploy check, security review and its fixes)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: this is the TL-P2-46 and TL-P3-16 fallback review at the P3 freeze ([TL-P3-26](2026-10-07-tl-p3-26-security-review-and-freeze.md) point 3). Every earlier P3 batch already passed its own delta review, so this one covers only what changed since a22f288. Codex reviews the whole P3 range before P4. Counters: read only this packet, the review record, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff a22f288..<frozen SHA in your prompt> -- src api runner scripts public/_headers docs/runbook.md`. Per change:
  - `dab6b02`: production check in `deploy-staging.sh`.
  - `0d5eb6d`: the security review record and runbook corrections.
  - `bf51a52`: `token-key-rotation-reconsent`, F1.
  - `29c82ac`: `tidy-pin-actions`, F2.
  - `ac960c2`: `app-security-headers`, F3. Adds `public/_headers`, the Worker's CSP and `scripts/serve-dist-with-headers.mjs`.
  - `28ca281`: `cookie-host-prefix`, F4.
  - `88f4424`: `log-no-folder-content`, F5 and F6.
  - `3e313a8`: `instance-private-check`, F7.
  - `78ae68c`: `deletion-allowlist-doc`, F8.
  - The coordinator's 30 s timeout on the deploy-staging tests.
- **Contracts:**
  - `docs/harness/2026-10-07-p3-security-review.md` (findings F1–F8);
  - the packets `2026-10-07-p3-19-*` and `2026-10-07-p3-20-security-fixes-packet.md`;
  - TL-P3-26.
- **Look hardest at:**
  - **F1.**
    - Is every path that decrypts the refresh token covered: the app's token route, the runner's token route and any refresh?
    - Does sign-out bump the generation so other devices end?
    - Does the next sign-in really send `prompt=consent`?
    - Can a merely malformed stored value lock someone out for good?
  - **F3.**
    - Does the CSP block anything the app needs: Drive uploads, `alt=media` downloads, thumbnails, the service worker, the manifest, fonts?
    - Is the inline-script hash right for the built `index.html`, and will it break silently if that script changes? Is there a test?
    - The landing gets `'unsafe-eval'` through a `!` detach. Is that the narrowest option, and does Cloudflare honour the detach? Cite its docs.
    - Is `includeSubDomains` on HSTS safe for the staging host?
    - Does the Worker's own CSP break any page it serves?
  - **F4.** The `__Host-` attributes. Are the old cookies cleared on every path that matters (callback, sign-out), or can a stale `bower_session` linger and confuse anything?
  - **F5 and F6.** Can any log line still carry a note path or file text? Trace the `console.error(e)` calls on caught Drive and fetch errors: `runner/src/drive.ts:222`, and `src/data/spine/records.ts:183`, `:215` and `:370`.
  - **F2 and F7.** Are the SHAs the v5 commits? Is the private check run before any clone or push?
  - **Overall.** Is anything in the review left without a fix or a P4 note?
- **Run:** single test files only, one at a time. Never run the deploy or instance scripts outside their stubbed tests, and never run `wrangler`, `gh` or any network call. Make reproductions in your own worktree under `/private/tmp/p3-freeze-review/`, and remove it afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
