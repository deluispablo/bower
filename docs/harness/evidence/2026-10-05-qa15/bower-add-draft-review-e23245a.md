# Independent S01 Add draft candidate review

Plan **2026-10-05-contracts-2**, P2 **C02/C16**, approved **D02**; entry **add-draft-no-loss**. Reviewer `/root/prerequisites_review`. Immutable base `f739b5c178c67a1d4dc93ace25a8c595d8cbd27e` → candidate `e23245a7882744a40173bf8e27602b252a285dfb`; checkout `/private/tmp/bower-p2-journal-ack`, branch `codex/p2-add-draft-no-loss`, clean candidate. Three files only: src/features/piles/Add.tsx, new Add.test.tsx, e2e/qa9.spec.ts. Integration is separate root-owned e37af01 with dirty shared records/evidence during this review; they were left untouched. Adopted and main plan revisions match.

Inspected exact Git diff/source, entry verify/steps, D02, supplied public-render red/candidate/check evidence and adjacent UI/store helpers. No tests/init/build/browser/provider/Git mutation/source edit/shared-record write/delegation or closure. This scratch report is the sole output.

## Verdict

**Changes requested: one Important pending-admission draft-loss path.** The static missing-file and late-byte guard corrections are coherent and backed by supplied genuine assertion reds. Remaining finding is source-derived; this reviewer did not reproduce it through execution. It must be reproduced or disproved before recording a new observed failure or integrating the candidate as clean.

### Important: edits/new rows during pending admission are silently cleared on success

Candidate `/private/tmp/bower-p2-journal-ack/src/features/piles/Add.tsx:155–168`, :183, :194, :206–219, :233–239, :262–285. This also exists at the original base; it is adjacent behavior relevant to the assigned successful-admission no-loss gate, not a regression newly introduced by the missing-byte guard.

Trigger: begin saving a complete draft with a deferred addPile promise; while Saving is visible, edit What is this or choose/drop a new file/add a link; then resolve the originally captured admission successfully. Only the save button is disabled by busy. The textarea/file/camera/link/form/drop/remove controls can still mutate current state/sessionStorage. The request captures the earlier text/items, yet its success unconditionally setText('')/setItems([]) and navigates home, discarding later text/rows that were never admitted. items.forEach forgets only captured keys, so later file bytes can also remain orphaned in the Map with their row gone. Current held-admission test at Add.test.tsx:97–120 checks retained original input and a second disabled save click; it does not attempt another draft mutation while pending.

Correction: within the already assigned Add/test files, prove this with a meaningful public-render deferred-admission assertion red at this candidate. Freeze draft-changing controls and guard file/drop/form/remove/context handlers while pending, including a file picker opened just before save, or implement snapshot-aware success cleanup that preserves later unsubmitted work. Do not simply clear the latest mutable draft on an earlier request's success. Add positive rejected-admission recovery/unlock and unchanged complete-set/no-double-admission controls. No wire/store/account/durable-readiness extension is needed for this narrow repair. A real addPile outcome ambiguity still remains outside this screen guarantee.

## Verified source/evidence coverage

Render-time button completeness uses ready.length versus items.length, so context/another ready member cannot unlock incomplete submission. The save handler rechecks current public byte-store availability before busy/addPile and rerenders rows for a newly lost Blob while retaining the stored draft/context/ready bytes. Because checking and building the request are synchronous before the first await, there is no asynchronous interleaving between that guard and item mapping in the current code. Full selected items are mapped, rather than filtering missing rows. Blob truthiness preserves zero-byte files. A missing non-link causes whole-draft refusal; URLs retain the existing link contract. UI copy offers reselection/removal and existing rows name missing files.

Successful unchanged-draft admission clears captured bytes/storage and navigates only after the resolved result; rejected admission reports details and leaves draft/context/rows/Blob references intact. No hash/name/content identity guarantee or safe retry after an ambiguous accepted response is added. Reselection remains the pre-existing name-based refill path, explicitly excluded from full D02 certification. No Sources/NewPile/wire/session/ownership/runner/shared readiness files changed.

Three original named assertions exercise context-only unavailable row, mixed unavailable+ready/link, and public keep→render→forget→click. Supplied red evidence records actual omitted/bodyless addPile inputs and draft loss; named final log3pass/6 pattern exclusions and full Add controls9pass are inspected. Final supplied pnpm check records526pass/52files, zero lint errors with21 existing warnings. Original init/install and first-check test-lint failures are distinguished from assertion reds. None were rerun by this reviewer.

qa9 explicitly annotates D02 supersession and retains on screen: prefix. The revised scenario checks disabled save after reload, context and Add route preservation, one reselection row, successful complete save/toast/navigation. It replaces the contradictory successful omission expectation with refusal/recovery; historical helper/tests/proofs remain preserved according to root records. Browser success of this authored scenario, full demo/fake/PWA and affected phone/desktop/keyboard/console evaluation remain pending. This review does not treat type/lint/unit checks as browser evidence.

## Limits and next action

Reproduce/repair the Important same-entry pending mutation path, preserve e23245a evidence and return one immutable replacement for renewed review. Root alone integrates, runs actual inverse-fix assertion red/check/unchanged verify and records closure after required browser gates/evaluation. Later relevant source changes invalidate affected evidence.

Durable byte retention/reload/account cleanup, identity/hash reselection, expected member manifests, cross-client partial-pile readiness, accepted-work recovery/deduplication, offline notes and provider resumable semantics remain separate requirements. A screen guard and typed admission double do not certify real Drive effects, browser-independent acceptance, full D02 or P2. No phase acceptance or P3/P4 implementation is approved.
