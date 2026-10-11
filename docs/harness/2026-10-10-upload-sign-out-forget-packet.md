# Packet: upload-sign-out-forget (C02 E2; escalated: privacy and data safety)

- **Entry:** `upload-sign-out-forget`. Worktree `/private/tmp/bower-upload-sign-out-forget`. Escalated (TL-P4-29). Implementation after upload-resume-after-reload integrates (shared upload-queue and live tests). `ui: true` for close only: the designer verifies what the person sees after signing in again (U3).
- **Rulings:** TL-P4-53 (DECISIONS: C02 Q1–Q7 as recommended; sign-out purges pending upload bytes, the current AGENTS rule, and still forgets locally if the remote fails; unknown is never zero; no automatic recreation). Prep: `docs/harness/2026-10-10-c02-upload-prep.md` (sections 2–5; its red table in section 5).
- **Owned files:** as the prep's section 3 row for this entry, plus one new red test file named below. No `scripted.ts`, `runner/`, `api/`, `src/data/contracts/` or brain contract file. A file outside the list needs a lead ruling first.
- **Research first:** cite the Google Drive resumable upload protocol (session URI, status query with `Content-Range: bytes */N`, 308, session expiry) and the IndexedDB durability model.

## Contract (Q1)

1. Accepted sign-out and auth expiry purge that account's pending upload bytes and metadata (device.ts forget path, existing `forgetAccount`, `stop`, store clear); ordinary page disposal keeps them. The journal outbox alone stays (AGENTS hard rule).
2. A failed remote sign-out still forgets locally; a local purge failure is a BowerError with one short sentence, details to console.error, never a silent success. No late resurrection: an in-flight transfer cannot re-store bytes after the purge.
3. Old queue/store comments that promise retention through sign-out are corrected.
4. The queue exposes the count of things still sending from this device, from its one home (no second store), for the "Sign out now?" sheet in `c02-upload-count-ui` (TL-P4-53 addendum 1).

## Reds (separate Codex session)
The prep's E2 reds in a new file `src/data/upload-sign-out.test.ts` through the live sources' sign-out and the real queue, fake IndexedDB.

## Verify
The reds by exact name, `pnpm check`, e2e app on demo and fake.

## Commits
Red, fix, notes (`docs/harness/2026-10-10-upload-sign-out-forget-notes.md`, line 3 `implementer: codex`, `removed:` lines).
