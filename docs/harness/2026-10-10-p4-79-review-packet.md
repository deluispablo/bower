# Packet: P4-79 review (d-v2-24a addendum-7 re-plan through round 4, written by Codex; escalated, ui: true)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-d-v2-24a`. You may run `pnpm exec vitest run src/bird --maxWorkers=2` there.

## What to review

- **Range:** `git diff de1183df..HEAD` (the addendum-7 re-plan: red 74d932f5, fix c8ab9ce8; addendum-8 test updates 12ec932b; fix round 2 reds 0ee5b2b5, fix b44b2dea; round 3 reds, fix 1b5696b6; round 4 reds d240b131, fix 2ca273f2; notes and the Codex adversarial passes).
- **Contract:** the packet `docs/harness/2026-10-09-d-v2-24a-packet.md` (its designer-signed "What the person sees" is contract), the contract `docs/harness/2026-10-09-tl-p4-26-d-v2-24a-contract.md`, DECISIONS TL-P4-26 addenda 1-10 and TL-P4-25 addenda 8-15 (addenda 8-10 are on main: `git -C /Users/deluisp/Projects/bower-app show main:docs/harness/DECISIONS.md | grep 'TL-P4-26 addendum'`).
- **Adversarial passes:** `docs/harness/2026-10-10-codex-d-v2-24a-adversarial.md`. The round-4 pass flagged a size change mid-settle that applies at release; the lead rules whether it is Minor (like addendum 8's queued pose) or a fix. Judge it too, but do not BLOCK on it alone unless you find it breaks a hard rule.

## Look hardest at (the lead's bar after round 4: only these block)

- Hard rules: reduced motion, "Bower moves", one animated bird per screen, focus.
- The addendum-7 property: the moves-off settle is one blend of the whole drawn output to the still frame, every other motion source suspended at the one gate (apply() reachable only through it; CSS motion owned by it), a pose change queued until release, no jump at release, nothing moving after release.
- One engine, one pose script, one react() port; no second path; reds not loosened by implementers (compare each red commit with HEAD); `tests changed:` lines.

Already run by the coordinator: pnpm check and the 6-spec e2e (bird-engine, qa6, qa7, qa10, app, robustness) on demo and fake at each round.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
