# Technical-lead decision TL-P3-2026-10-07-25: pile notes at admission, and the last P3-E entries

**Coordinator questions, 2026-10-07**, after P3-14 to P3-16 closed (`0abbbac`).

1. **`deploy-staging-hardening`** (`bower-implementer`), adopted as drafted, before the lead uses `scripts/deploy-staging.sh`. The script:
   - refuses any `.env*` file in the checkout, because Vite reads `VITE_API_URL` from it even after `env -u`;
   - matches "Uploaded bower-staging" rather than the `--var` echo;
   - corrects the wait message.
2. **`worker-reads-pile-notes`** (`bower-escalated`). Admission and the runner must agree on what is ready.
   - **Admission reads each declared pile's note** with the same shared readiness code the runner uses, so a pile the runner would hold (newer, damaged or whitespace-only note) is not admitted. When only held piles remain, the answer is 409 `nothing` "Nothing in the inbox is ready yet.".
   - **The Worker reads the note transiently.** It keeps only the note's id and version in the manifest, never its text, and never logs it. That keeps the contract's "credentials and pointers, never content" for what the Worker stores.
   - **A pile can still change between admission and run** (a race), so if the runner then holds every admitted pile, the run ends `done` with nothing filed and a report saying nothing was ready yet. It is not "stopped before changing anything", and it is not a failure that "Try again" repeats.
3. **`total` means things only,** folded into 2. The app's "Reading N things" is then true in every case.
4. **The last two P3-E entries:**
   - **`behavior-suites-real-adapters`** (`bower-escalated`). The shared P2 behaviour suites run against the real adapters (the real Drive client, Worker HTTP and runner) over replayed transports. They cover the exit checklist's cases: browser close, revoked auth (Google `invalid_grant` leading to signed out), duplicate dispatch, expired attempts, lost callbacks and recovery. The live evidence already walked on staging (first run, cancel-and-recover, the Drive suite, R2 to R4) is cited, not repeated. Revoking access in a test account's Google settings is one owner step in the C16 walk.
   - **`compatibility-accepted-app`** (`bower-implementer`). Versioned fixtures of every `.bower` file shape and journal line the accepted P2 app writes are read by the shared core and the runner. A check lists every change under `src/features/` and `src/data/contracts/` since the P2 close (`00ec9a5`), each tied to its entry, to prove there was no screen or domain rewrite ("Prove the accepted app needs no screen/domain rewrite"). Reading the original app's real Bower folder is P4's pre-switch check.
