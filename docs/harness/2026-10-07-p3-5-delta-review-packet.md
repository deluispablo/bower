# Packet: P3-5 delta review (creation claim + template ids)

Starting model: `bower-escalated` (Opus), fresh, read-only. Reason: the lead's ruling allows one delta review (TL-P2-38) of data-safety code in the person's Drive; [TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) fallback until Codex returns. Counters: read only this packet, the two packets below and the diffs, never the workers' deliveries; assume the code is wrong until a test or a reading proves otherwise.

- **Diffs** (read-only, do not edit or commit):
  - the vault fix round: `git -C /private/tmp/bower-p3-vault2 diff 66e60b2^ 66e60b2 -- api/src/vault.ts api/src/person.ts api/src/person-schema.ts` (the 60 s creation claim, the reserved folder id, the template-complete flag); packet [2026-10-07-p3-5-vault-fix-packet.md](2026-10-07-p3-5-vault-fix-packet.md) and the lead's amendment: both mechanisms; the claim (not Drive calls inside the object) and no renewal were accepted.
  - the follow-up: `git -C /private/tmp/bower-p3-tids diff 4f4c706^ 4f4c706`; packet [2026-10-07-p3-5-template-ids-packet.md](2026-10-07-p3-5-template-ids-packet.md).
- **Question to answer:** under any interleaving of two calls (claim expiry, a lost reply, a crash between reserve and create, between create and store), can the person end with two Bower folders, a duplicated template item, an overwritten or deleted item, a pointer to the wrong folder, or a folder marked complete that is not? And does Drive really answer **409** to `files.create` with an id that already exists (cite Drive v3 docs; if the code relies on a wrong status, that is Important)?
- **Also:** the schema steps 4–5 migrations, the found-by-marker path (template ids reserved by a second call), clearing stored ids once complete, and whether each test can fail for its stated reason.
- **You may** run `pnpm -C api exec vitest run` in `/private/tmp/bower-p3-tids`, output to `/tmp/p3-5-delta-*.log`; throwaway tests only under `/tmp`.
- **Deliver, under 25 lines:** verdict (CLEAN / BLOCKING), blocking findings with the interleaving and the missing test, minors one line each.
