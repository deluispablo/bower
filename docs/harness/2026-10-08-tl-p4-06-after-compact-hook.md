# Technical-lead decision TL-P4-2026-10-08-06: a hook after every compaction

**Owner question, 2026-10-08:** is a compaction safe, and should we add the hooks?

**Ruling: yes to both.** Compaction keeps a summary, not what a session read, and P3 showed the coordinator drifting after compactions (TL-P3-29). `AGENTS.md` is reloaded on its own, but nothing told a session to re-read its own state. A `SessionStart` hook with the `compact` matcher runs right after every compaction and adds its output to the session's context ([hooks](https://code.claude.com/docs/en/hooks)).
- **`.claude/settings.json`** runs `cat harness/after-compact.md` on `SessionStart` with the `compact` matcher.
- **`harness/after-compact.md`** tells the lead to re-read `LEAD.md` and the latest `DECISIONS.md` lines, and the coordinator to re-read `HANDOFF.md` and `ACTIVE.md`. It repeats the output, question and message rules in five lines.
- **`src/docs.test.ts`** checks that the hook and the note stay in place.

It loads in every session whose working folder is the bower-app checkout, which is both sessions, after their next start or compaction.
