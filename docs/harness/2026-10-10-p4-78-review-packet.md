# Packet: P4-78 review (c5-css-tokens, written by Codex; DEFECTS css-unknown-token)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c5-css-tokens`. You may run `pnpm exec vitest run src/styles --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...c5-css-tokens`: `src/styles/css-tokens.test.ts`, the two CSS lines, the notes and compatibility row.
- **Ruling:** DECISIONS "DEFECTS css-unknown-token" (on main: `git -C /Users/deluisp/Projects/bower-app show main:docs/harness/DECISIONS.md | grep -A2 css-unknown-token`): `var(--muted)` at note.module.css:71 and bower.module.css:30 becomes `--text-muted`; a guard test beside control-line.test.ts: every `var(--x)` in src/**/*.css names a defined property (a token, a `--x:` declared in src CSS, or one set inline from TSX such as --lw and --rw). It fails on these two first.

## Look hardest at

- The guard is sound: it reads every CSS file under src, finds every `var(--x` (with or without fallback), and its defined set really is tokens + declarations in src CSS + inline TSX custom properties, not a hand list that hides future misses; comments and strings handled; it fails on exactly the two uses before the fix.
- Only the two lines changed; `--text-muted` is a real token.

Already run by the coordinator: pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
