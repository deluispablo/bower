# Protected Current state prose: consumer unit

Prepared by the integration coordinator (Claude, `claude-orchestrator-2026-10-06-e759b272`) under contracts-2 / main `10ca886`, TL-P2-2026-10-05-03 (Ownership/2 adopted for pure implementation; consumer before producer) and P2 C03/C14. Entry `protected-current-prose` (qa-13), already registered with its unchanged verify.

## Assignment

- Role: implementer. Tool/session: Codex, `protected-prose-impl-1`.
- Integration: `/Users/deluisp/Projects/bower-app`, branch `codex/close-phase-2`; current record `docs/harness/ACTIVE.md` there.
- Worker checkout: `/private/tmp/bower-p2-protected-prose`, branch `codex/p2-protected-prose`, base `6770d8f`. Coordinator ran `harness/init.sh` there; log `/private/tmp/bower-p2-protected-prose-init.log`.
- Writable: `src/data/vault/note-format.ts`, `src/data/vault/note-format.test.ts`. Everything else is read-only, in particular `ownership-format.ts` and its tests, `types.ts`, `drive-vault.ts`, fake runner/worker, fixtures, configuration, dependencies and shared records. If the fix truly needs another file, stop and report why instead of editing it.
- Verify (unchanged): `pnpm vitest run src/data/vault/note-format.test.ts -t "protected sections retain prose and tasks outside the personal body"`.

## Behavior

The shared note reader must honour the adopted `ownership/2` grammar through the integrated pure parser `src/data/vault/ownership-format.ts` (`parseOwnership`, `togglePersonalTask`); do not re-implement the grammar. Authoritative grammar: `docs/harness/evidence/2026-10-05-local-prerequisites/bower-protected-ownership-final.md` and its fixtures.

- An `ownership/2` note with a paragraph and a task under Current state, followed by a personal block containing `## My notes` and a task, then Timeline: the protected paragraph and task never appear in the personal body and never count as personal tasks. Display state is derived from the protected bytes.
- Ticking a personal task through `toggleTaskInText` changes only that checkbox byte; every protected byte is unchanged. A protected task cannot be ticked through the app: no index reaches it.
- Legacy notes (no `bower_format`) and notes without frontmatter keep exactly their current behavior: existing tests stay green and unchanged. `## My notes` is never reserved in legacy notes; no protect-until-next-heading heuristic.
- A damaged, unsupported-version or invalid-encoding `ownership/2` note must not become personal editable text. Refuse task edits with a `BowerError` (one short sentence) and keep the source unchanged. Never guess spans or auto-repair.
- No producer changes: `serializeNote` must not start emitting ownership/2 (TL-P2-03: no real v2 producers yet).

## Evidence

Write the named test first using synthetic text only (Alex, `you@example.com`). Commit it on top of the current code and capture genuine assertion reds; load or import errors do not count. Then implement the smallest fix, run the unchanged verify and full `pnpm check`. Deliver: test-only commit SHA, fix commit SHA, changed paths, red/green/check logs under `/private/tmp/bower-p2-protected-prose-evidence/`, and remaining limits. Do not run `done.sh`, edit shared records, push, use a browser/provider/network, or spawn agents. Do not claim rich-state serialization, Timeline-append preservation (fake runner) or Drive write safety; report them as remaining limits.
