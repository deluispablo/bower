# Technical-lead decision TL-P4-12: the output rule becomes an output style

**Owner report, 2026-10-08.** After compaction the coordinator still talks too much.

**Measured.** In the coordinator's transcript, the TL-P4-06 hook does fire after each compaction: the `after-compact.md` text arrives right after the `compact_boundary`, the last time at 13:44:09Z. The coordinator still ends its turns with 2–4 explanatory sentences written for a human reader, not with one line. The rule lives only in prose (AGENTS.md, the hook's reminder), and prose does not enforce itself (the token research's conclusion, TL-P2-44; [Claude Code, CLAUDE.md is guidance](https://code.claude.com/docs/en/memory)).

**Ruling.** The rule moves into the session's system prompt through a custom output style ([Claude Code, output styles](https://code.claude.com/docs/en/output-styles)). An output style replaces part of the system prompt, so it survives every compaction, unlike chat context and unlike a reminder that is read once.
- `.claude/output-styles/bower-quiet.md` sets out the rule:
  - no text between tool calls;
  - one line under 120 characters at the end of a turn;
  - details go in messages and files;
  - questions go to the lead.
- `keep-coding-instructions: true` keeps Claude Code's own engineering instructions.
- The lead sets this style on the coordinator's session. The lead's own session keeps the default, since it talks to the owner.
- The hook and the AGENTS line stay as a second reminder.
- A docs test checks that the style file exists and states the one-line rule.
