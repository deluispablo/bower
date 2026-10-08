# Defect log

One line per defect, newest last ([DEFECTS.md](DEFECTS.md)). Format:
`- <date> <id> | <severity> | <what was seen, with evidence> | <status: diagnosing / ruled / fixed <sha> / trivial <sha>> | <note path>`

- 2026-10-08 consolidation-review | Important | Four reviews of e317fc7 found the same ideas implemented several times (engines, Drive clients, fences, refusals, question ids, alarms, UI loading) | ruled: TL-P4-14 | [the decision](2026-10-08-tl-p4-14-consolidation.md)
- 2026-10-08 home-empty-48s | Important | Staging 45e9742, account A, empty Inbox: Home shows "Looking…" for about 48 s; 126 Drive calls; listings done by 3 s (each listing made twice, in parallel); then 59 media reads one at a time (~700 ms each: questions.json, suggestions.json, Rules.md twice, last-run.json and old declaration-decl-* files) and 56 in parallel at 45 s (declarations and disposition-*); 113 distinct files for no pile in the Inbox. Was about 24 s/221 calls at 2b08fc1, ~45 s/108 at 924e6d6. Fake latency tests pass (0.6 s Inbox) | diagnosing | docs/harness/defects/2026-10-08-home-empty-48s.md
