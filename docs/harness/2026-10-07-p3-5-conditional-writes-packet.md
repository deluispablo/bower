# Packet: vault-template-ids fix round: conditional writes (P3-5)

Starting model: `bower-escalated` (Opus), fresh. Reason: concurrency finding from the delta review.

**Summary of the delta review (10 lines).** At `4f4c706` the 60 s claim is checked only when it is taken; a call whose claim lapsed still writes unconditionally: `reserveFolder` overwrites `pending_folder_id` and the template ids, `reserveTemplate` overwrites the template ids, `setFolderId` moves the pointer. (1) Call A reads empty state, stalls in the marker search (or in `generateIds`) past 60 s; call B claims, reserves Y, creates, fills, completes; A resumes, reserves X over Y, creates a second marked folder, `setFolderId(X)` resets complete and fills X. Probe: two marked folders, answers name different folders. (2) Existing empty marked folder, no stored ids: A stalls in `generateIds(13)`; B reserves and fills but stalls on `Rules.md`; A overwrites the ids, lists (no `Rules.md`), creates `Rules.md` with its id; B creates `Rules.md` with its own. Probe: 14 items for 13 paths. Probes: `/tmp/p3-5-probe/api/test/vault.test.ts` (copy them as the red tests). Drive's 409 on a duplicate pre-generated id is confirmed by the Drive docs.

- **Checkout:** `/private/tmp/bower-p3-tids2`, branch `claude/p3-tids2`, from `4f4c706`. Never push or deploy; no real accounts or secrets.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/src/{vault,person,person-schema}.ts`, `api/test/{vault,person}.test.ts`, the probe file above.
- **Acceptance contract:**
  - Every person-object write the vault path makes is conditional (compare-and-set inside the object): reserve the folder only when no `pending_folder_id` and no pointer is stored, otherwise adopt what is stored; `reserveTemplate` keeps ids already stored for that folder and returns them; `setFolderId` sets only from null or to the same folder; the complete flag is set only for the folder that is the pointer. Optionally also require `vault_claim = holder`; when a write is refused, the call re-reads and continues with what is stored (never a second folder, never a duplicate item).
  - Named tests (red first, from the probes): `a call whose claim lapsed before reserving makes no second folder` and `a lapsed call on a found folder makes no duplicate item`. The two existing named tests stay green.
  - Files in scope: `api/src/**`, `api/test/**`.
- **Gates:** the entry's verify (query `harness/features.json` in `/Users/deluisp/Projects/bower-app` with `jq`), `pnpm check`. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 12 lines:** commit SHA, files, red→green, gates.
