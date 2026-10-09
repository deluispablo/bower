# Packet: c3-permissions (stage 3, TL-P4-20)

- **Entry:** `c3-permissions` (harness, config). Worktree `/private/tmp/bower-c3-perms`, branch `c3-permissions` from `claude/p3` (after c3-hooks merges).
- **Authorization:** the owner authorized the config changes in the coordinator's chat on 2026-10-09: `.claude/settings.json` (hooks and permissions), agent definitions and hook scripts.
- **Ruling sweep:**
  - [TL-P4-20](2026-10-09-tl-p4-20-method-refinement.md), table row 4.
  - [BACKUP.md](BACKUP.md): the one allowed push.
  - AGENTS hard rules: `public/landing/` is never hand-edited; workers never push.
- **Starting model:** `bower-implementer` (Sonnet).

## Contract

1. **Deny rules** in `.claude/settings.json` `permissions.deny`:
   - `Edit` and `Write` on `public/landing/**`;
   - reads of `.env*`;
   - `git push`.
2. **One allowed push.** A PreToolUse hook allows exactly `git push backup refs/heads/main:refs/heads/main` (BACKUP.md) and nothing else: no other ref, no `--force`, no other remote.
   - Research how a hook allow interacts with a deny rule (code.claude.com/docs/en/permissions and hooks), and cite it.
   - If a deny rule cannot be overridden by a hook, use a hook-only denial for `git push`, and say so on your card.
3. **Prove offline what you can.** The hook's decision is tested on fixture inputs. The coordinator checks the live backup push once, after merge. Never push yourself.

## Red

`only the backup push of main is allowed`: the hook, fed fixture inputs, allows every push today.

## Verify (exact names)

- `only the backup push of main is allowed`
- `a forced or other-ref push is refused`
- `settings deny edits to the landing export and reads of env files`
- `pnpm check` must be green. Name the test file(s) on your card.

## Commits and limits

- Commit order: the red (tests only), then the fix, then the notes file in its own commit, with `tests changed:` lines.
- Edit only `.claude/settings.json`, the push hook script, and its tests.

Reviewers are read-only. They never move the main checkout in any form.
