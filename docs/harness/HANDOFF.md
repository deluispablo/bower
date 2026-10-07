# Current handoff: Claude coordinator, P3 closed, paused

Coordinator: the Claude Code session named "Orquestador". It integrates in `/Users/deluisp/Projects/bower-app` on branch `claude/p3`. Lead: the Planificador session ([DECISIONS.md](DECISIONS.md)). Output rule: [TL-P3-29](2026-10-07-tl-p3-29-output-rule-survives-compaction.md), now in AGENTS.md. Minors: [P2_POLISH.md](P2_POLISH.md). P2 handoff: git history of this file.

## Where things stand (2026-10-07)

- **P3 is closed. On hold.**
  - Dossier: [2026-10-07-p3-dossier.md](2026-10-07-p3-dossier.md). The lead reviewed it: accurate.
  - The owner accepted P3 (main 88bb7de). P4 is not authorized. **Start nothing until the lead messages.**
- **Frozen code: `426a9fd`.** Staging runs `aeb99a4` (bundle `index-nkzmUjZs.js`).
  - The four suites are green, all 350 entries pass, and the freeze reviews passed.
  - C16 re-walk PASS.
  - C01's live revocation is pending, deferred by the owner. It will be done later with a different test account.
- **Codex reviews the P3 range on 2026-10-12, before P4** ([TL-P3-16](2026-10-07-tl-p3-16-codex-review-after-p3.md)).
- **Backup:** `backup/main` = `680e95e` (the dossier), checked against the remote. The lead later added `22299b5` to main.
  - Push per BACKUP.md: `git push backup refs/heads/main:refs/heads/main`, then check the remote SHA.
  - Bash runs outside the sandbox (keychain).
- **Cleanup done:** coordinator worktrees removed; nothing was left on port 5198.
  - **Kept:** `/private/tmp/bower-p2-o5-snapshot` holds **uncommitted P2 work** (fake-drive WTF-8 bytes, fake-runner, pile-readiness, drive-vault; base `b3c2eb7`). The lead decides whether it is wanted or dropped.
  - **Kept:** `/private/tmp/bower-tl-planning` (the lead's), `/private/tmp/p3-c16/` (walk inputs and notes, cited by the dossier), and the P2 `*-evidence` folders.

## How to run a round (unchanged)

- At most two workers at a time, through `.claude/agents/` only.
- Packets are one page. Card lines stay under 120 characters (TL-P3-29).
- `bash harness/done.sh <id> "<msg>" --fixed-in <sha>`. When the fix revert can't load (a new file), or later commits touched the same lines:
  - prove the red at the tests-only commit by hand;
  - close with `--known-green "<evidence>"`.
  - On the "no assertion failed" exit, `done.sh` leaves the reverted files behind. Restore them with `git checkout`.
- Suites per batch on an idle machine, with logs to `/tmp/<name>-*.log`. Merge each worker branch with `--no-ff` into `claude/p3`. Main moves with `git fetch -q . claude/p3:main`.

## Staging traps (P3)

- **Presses:** the permission system refuses an evaluator's press. The coordinator presses, by keyboard: focus the button by page script, then Enter.
  - The owner allows "Tidy up", run, answer, add-pile, "Use here" and Bin/Undo (probe folder only) presses during walks.
  - Never: delete-account, sign-in or sign-out, production.
- **Service worker:** a new one waits until every tab closes, and a reload keeps the old bundle. Close the tab and open a new one, then check `index-*.js`.
  - The new tab then needs "Use here".
- **The Worker's CSP is `default-src 'none'`**, so page-script `fetch` from `/health` or `/me` documents fails. Run scripts from an app page.
- **A stuck "saving" run:** read the job with `gh run view <id> -R deluispablo/bower-home --log` (read only). The Worker redispatches attempt 1 at phaseAt + 30 min.
- **Test account addresses never go in the repo or in messages.** The staging origin and the probe folder id go only in worker prompts.
