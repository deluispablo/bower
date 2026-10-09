# Technical-lead decision TL-P4-29: Codex first

**Owner request, 2026-10-09:** shift the development weight to Codex, because the Claude token budget is running out.

**Evidence (ccusage, 2026-10-09):**

- **Claude used about 98% of the tokens** (2.24 billion against Codex's 52 million). Almost all of it is cache reads, in long sessions with many turns.
- **The heavy Claude rows are escalated implementations and their fix rounds:**
  - c4-create-landed: 410k tokens, 165 tool uses;
  - c4-undo-compensate: 246k, which hit the turn limit;
  - d-v2-07: six rounds of 84k to 135k each.
- **Claude reviews are cheap** (30k to 55k), and Codex's passes found the defects that sent those rounds back.
- **The coordinator pays for every Codex entry.** It commits and runs the gates itself, because Codex's sandbox cannot write the git index or take the /tmp lock.

## Rulings (amending TL-P4-23 and TL-P4-28)

1. **Codex implements everything, escalated entries included.**
   - Claude no longer implements. It keeps:
     - the final review, a fresh `bower-reviewer` that gives the PASS;
     - the designer's verification;
     - this lead.
   - Fix rounds go to Codex too.
   - Claude `bower-escalated` is the fallback, and only after two Codex rounds in a row fail on the same entry. Under the re-plan rule (TL-P4-15), the third round is a re-plan anyway.
2. **Independence moves from provider to session.** On escalated data entries, one Codex session writes the fast-check red from the packet's invariants and commits it first. A different Codex session implements, and may not change that red (TL-P4-22 addendum 22). A third Codex session, read-only, runs the adversarial pass. The Claude reviewer then checks the pinned range against the packet, and its PASS is the only gate that closes the entry.
3. **The read-only analysis roles go to Codex.** These are diagnosis (the `bower-diagnoser` role, written to the same note path), impact notes, and contract sign-offs. Each runs as `codex exec --sandbox read-only`, and the coordinator saves its output to the note.
4. **Codex runs its own gates and commits.** Trial on the next Codex entry: `--sandbox workspace-write --add-dir <main checkout>/.git --add-dir /tmp`. This lets Codex write the index and take `/tmp/bower-heavy.lockf` under `harness/with-lock.sh`. It still never pushes, never merges and never switches branches. The coordinator checks a clean tree and a green `pnpm check` at its HEAD before review. If the trial fails, the coordinator commits for Codex as before.
5. **The cap becomes 1 Claude plus 3 Codex workers**, on files that do not overlap. The TL-P4-23 stop rule stands: drop a Codex slot if the lock wait eats the gain.
6. **The open queue moves now:**
   - d-v2-07 round 6, c4-create-landed round 1, c4-parse-once and d-v2-24a go to Codex;
   - c4-undo-compensate, already running on Opus, finishes there;
   - P4-C capabilities (C05 onward) are Codex implementations from the start.
7. **Long Claude sessions cost the most.** The permanent sessions keep messages combined and few. The lead asks the owner to compact a session when its context grows (TL-P2-45: only the owner compacts).

**What stays the same:**

- Personal-data and secrets rules apply to every Codex prompt.
- Every merge goes through integrate.sh.
- Every ui:true entry closes only after the designer verifies it.
- tokens.csv records both providers. The stage-end review compares the fix rounds per escalated entry and Claude's share against the 2026-10-09 baseline.
