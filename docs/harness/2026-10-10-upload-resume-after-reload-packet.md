# Packet: upload-resume-after-reload (C02 E1; escalated: data safety and recovery)

- **Entry:** `upload-resume-after-reload`. Worktree `/private/tmp/bower-upload-resume-after-reload`. Escalated (TL-P4-29): Codex red, Codex implementation, Codex read-only pass, fresh Claude review. `ui: true` for close only: the designer verifies the built reload behaviour (U3) before close; no new copy or screen here.
- **Rulings:** TL-P4-53 (DECISIONS: C02 Q1–Q7 as recommended; sign-out purges pending upload bytes, the current AGENTS rule, and still forgets locally if the remote fails; unknown is never zero; no automatic recreation). Prep: `docs/harness/2026-10-10-c02-upload-prep.md` (sections 2–5; its red table in section 5).
- **Owned files:** as the prep's section 3 row for this entry, plus one new red test file named below. No `scripted.ts`, `runner/`, `api/`, `src/data/contracts/` or brain contract file. A file outside the list needs a lead ruling first.
- **Research first:** cite the Google Drive resumable upload protocol (session URI, status query with `Content-Range: bytes */N`, 308, session expiry) and the IndexedDB durability model.

## Contract (Q2, Q5, Q6)

1. Every accepted Blob member is staged on the device before `addPile` reports saved (device staging, not Drive transfer); the explicit memory fallback keeps today's storage wording. Unsaved Add drafts are outside the promise. No new save-time bound.
2. After a reload, retained bytes resume through the existing queue, store and write-once read-back, with no picker and no second file: if the reserved file already arrived it is never sent again.
3. Limits stay (200 MiB, hash-match fallback, no Web Locks: hold honestly). A vanished destination is never recreated, renamed or moved; the bytes are held and the facts reported.
4. The resumable protocol is not rebuilt; one active-place mechanism (session fencing).

## Reds (separate Codex session)
The prep's E1 reds in a new file `src/data/upload-resume.test.ts` through public app entry points with the real queue, fake Drive and fake IndexedDB; deterministic barriers, no real timers.

## Verify
The reds by exact name, `pnpm check`, e2e app/capabilities on demo and fake.

## Commits
Red, fix, notes (`docs/harness/2026-10-10-upload-resume-after-reload-notes.md`, line 3 `implementer: codex`, `removed:` lines).
