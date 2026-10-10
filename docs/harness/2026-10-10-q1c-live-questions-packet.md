# Packet: Q1c, live publication of questions (escalated; TL-P4-44 Q2, with Q3/Q5/Q10 as landed in Q1a)

- **Entry:** `q1c-live-questions`. Worktree `/private/tmp/bower-q1c-live-questions`, branch `q1c-live-questions`. Escalated (run wire, Worker run state and publication lifecycle): Codex red session (may run now, tests only), Codex implementation **after Q1a integrates** (shared scripted.ts, run-manifest.ts, the runner's status path), Codex read-only pass, fresh Claude review. `ui: false`: no screen change (Q1b owns the UI after Q1c).
- **Rulings:** TL-P4-44 Q2 and addenda 1–2 (`docs/harness/2026-10-10-tl-p4-44-q1-contract.md`; DECISIONS); TL-P4-40 (2). Prep: `docs/harness/2026-10-10-q1-prep.md` (promise P2, its P2/P9 reds and its file ledger). Q1a's packet (`2026-10-10-q1a-stored-answers-packet.md`) defines what Q1c builds on.
- **Research first:** cite the standard for snapshot-replace status with a monotonic revision (optimistic concurrency/ETag-style versioning) and for idempotent retries by sequence number.

## Contract (Q2)

1. **Publication point.** A question is published once the run's plan is persisted, before its effects run (the first durable point; a crash cannot lose the question's action). No per-item streaming from inside the model reply.
2. **Snapshot.** The runner's status report carries the full snapshot of this run's open questions, replacing the previous one: at most 10, each within the existing question bounds, inside the existing 64 KiB body. A change raises the Worker's revision and leaves phaseAt alone. The existing attempt, seq and ticket fences apply; an old seq/attempt/ticket cannot replace the snapshot; malformed or over-bound payloads are refused.
3. **Merge.** `vault.questions()` merges the snapshot with questions.json by question id and askedAt; the Drive copy wins once it exists. Answered askings are filtered through the journal as today, so an old snapshot cannot bring one back. The vault emits on a run-status change, so Home refreshes. Wrong run/folder/session/revision is discarded.
4. **No second channel.** One attempt/seq/revision stream and the existing polling (runner/src/status.ts, api person run state, live/runs.ts); no SSE, second polling loop or second question store. The stored action never leaks into the public ReportQuestion or the status snapshot beyond what the card needs.
5. Old reports, questions, manifests and GET /status keep their meaning (additive wire field). Compatibility rows for contracts commits.

## Reds (a separate Codex session)

The prep's reds assigned to Q1c, through the real entry points: `q1-live-question-before-clear-effects-end` (P2), `q1-status-seq-revision-recovery` (P2/P9, api `createApp().request` routes), `q1-stored-and-live-question-merge` (P2/P6/P9, DriveVault via makeLiveSources and the HTTP Worker adapter). Rows as in the prep's red table, with Q1a's stored answer shapes. Codex cannot run api vitest (ports): it writes the api reds and the coordinator runs them.

## Verify

The reds by exact name, `pnpm check`, e2e app/capabilities on demo and fake.

## Commits

Red (tests only), fix, notes (`docs/harness/2026-10-10-q1c-live-questions-notes.md`, line 3 `implementer: codex`, `removed:` lines, compatibility rows).
