# delete-account-purge red evidence

implementer: codex

Scope: red-owning session only. No implementation, existing assertion changes, commits, network, or node_modules changes.

tests changed: src/data/upload-sign-out.test.ts: added five cases under four new test names; existing assertions unchanged.

## Reds

- `delete-account-purge: unreadable account uses the sign-out forget function (known identity: false)`
  - Fails at src/data/upload-sign-out.test.ts:1189: all three pending records and their ten-byte bodies remain after accepted deletion when /me is offline and identity was never known.
- `delete-account-purge: unreadable account uses the sign-out forget function (known identity: true)`
  - Fails at src/data/upload-sign-out.test.ts:1197: the queue spy records deletion calling queue.forgetAccount directly instead of the private forgetPerson function used by sign-out.
  - The known-identity fixture retains a cached /me answer; this case exposes the copied path, while the never-known case exposes the skipped purge.
  - The spy delegates to the real queue function and records its stack on deletion and sign-out. Both must contain the same forgetPerson frame. This deliberately pins the existing private mechanism without adding a production export; a copied direct queue call cannot pass.
- `delete-account-purge: sign-out before the new sign-in me resolves purges every account`
  - Fails at src/data/upload-sign-out.test.ts:1223: ACCOUNT_B metadata and its ten-byte body remain because the previous identity still scopes cleanup.
  - Worker /me is held with a promise barrier after the new sign-in starts, and sign-out completes before release. No real-clock waits.

## Controls

- `delete-account-purge: Delete my account waits for Worker agreement before purging` — passes.
  - Pending metadata and bytes remain while the Worker answer is held and after refusal. A later accepted deletion with a readable identity purges only that identity.
- `delete-account-purge: addendum 11 retries purge the last known identity only` — passes.
  - Both offline sign-out attempts call the real queue purge with the last known identity; the other account retains its metadata and bytes.

## Verification

- Full targeted files, with --maxWorkers=2: 3 assertion failures, 155 passes (153 existing cases plus two new controls).
- Packet name filter, with --maxWorkers=2: 3 assertion failures, 2 passes, 153 filtered cases.
- Full suite log: /tmp/delete-account-purge-tests.log
- Filtered red log: /tmp/delete-account-purge-red.log
- Existing contradictions: none found in either targeted file; every existing case passed.
- No pnpm check or e2e: this session was assigned reds only; the implementation and integration sessions own those gates.

Commands used:

```sh
pnpm exec vitest run src/data/upload-sign-out.test.ts src/data/live/live.test.ts --maxWorkers=2 --config "$RUN_DIR/vitest.config.mjs" --configLoader runner --fsModuleCachePath "$RUN_DIR/module-cache"
pnpm exec vitest run src/data/upload-sign-out.test.ts src/data/live/live.test.ts -t delete-account-purge --maxWorkers=2 --config "$RUN_DIR/vitest.config.mjs" --configLoader runner --fsModuleCachePath "$RUN_DIR/module-cache"
```

RUN_DIR is recorded in /tmp/delete-account-purge-run-dir. The temporary configuration extends the real Vite configuration, keeps both setup files, and redirects caches and timer-gate CPU reports to the OS temp directory. The temporary timer-gate setup differs only in absolute import paths and CPU report destinations. An initial setup-resolution failure was corrected by allowing that temporary directory through Vite's filesystem setting; it produced no test evidence. No tests wrote into the repository.

## Source

Standard method: Vitest vi.spyOn, documented in the installed node_modules/vitest/dist/index.d.ts:512–526 and linked there to https://vitest.dev/api/vi#vi-spyon. Existing live fixtures, real IndexedDB store, and real upload queue were reused. No network was used.
