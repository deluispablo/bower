# Packet: orphan-pile-count-data (C02 E3; escalated: recovery accounting)

- **Entry:** `orphan-pile-count-data`. Worktree `/private/tmp/bower-orphan-pile-count-data`. Escalated (TL-P4-29). Implementation after upload-resume-after-reload integrates (shared drive-vault.ts). `ui: false`: no screen reads the count yet (E4 waits for the designer and the owner).
- **Rulings:** TL-P4-53 (DECISIONS: C02 Q1–Q7 as recommended; sign-out purges pending upload bytes, the current AGENTS rule, and still forgets locally if the remote fails; unknown is never zero; no automatic recreation). Prep: `docs/harness/2026-10-10-c02-upload-prep.md` (sections 2–5; its red table in section 5).
- **Owned files:** as the prep's section 3 row for this entry, plus one new red test file named below. No `scripted.ts`, `runner/`, `api/`, `src/data/contracts/` or brain contract file. A file outside the list needs a lead ruling first.
- **Research first:** cite the Google Drive resumable upload protocol (session URI, status query with `Content-Range: bytes */N`, 308, session expiry) and the IndexedDB durability model.

## Contract (Q3, Q4, Q6, Q7)

1. One general unanchored-declaration classification, deduped by pile/declaration identity within the root; incomplete anchored piles are not counted; not every declaration left after tidy-up.
2. Retirement reuses the validated `accountPile` disposition/digest facts and the existing context-removal facts; an intentionally removed context or retired work is not counted; ambiguous context-only history is unknown.
3. The summary is a known count plus completeness from the same cached full read (existing record query and cache, invalidated by the existing vault refresh); unknown is never zero. An app-local summary shape on the vault source (not shared `Pile`/`SetAside`); no persistent orphan table, no second declaration scan or wire format.

## Reds (separate Codex session)
The prep's E3 reds in a new file `src/data/orphan-pile-count.test.ts` through the vault source with fake Drive.

## Verify
The reds by exact name, `pnpm check`.

## Commits
Red, fix, notes (`docs/harness/2026-10-10-orphan-pile-count-data-notes.md`, line 3 `implementer: codex`, `removed:` lines).
