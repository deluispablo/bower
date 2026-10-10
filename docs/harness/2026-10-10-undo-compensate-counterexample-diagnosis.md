# Defect undo-compensate-counterexample: diagnosis

**Finding: product defect in listing-cache freshness at the journal-to-Undo boundary.** Tab 0 acknowledges a rule that tab 1 created with a lost response, then removes its shared outbox copy. Tab 1’s cached Drive listing lacks that rule. Its Undo/removal therefore reports “That rule is no longer there,” although the rule exists in Drive.

**FIFO does not break. The person-state oracle is not reached. The model is not manufacturing a missing rule.** The immediate red is the unexpected `not-found` error at `src/data/vault/undo-compensate.property.test.ts:244`.

Checkout: `/private/tmp/bower-suites`, detached HEAD `78fda571c6102c85909533d409effd09dab40848`.

**Evidence and reproduction**

- The supplied Vitest log records the failure at `/tmp/undo-cx-check.log:2058–2074`: seed `752195386`, path `"49"`, `undoAll: true`, zero shrinks.
- Reproduced without writing files or using the network: loaded the unchanged TypeScript through an in-memory transpiler, supplied equivalent spy/assertion adapters, and ran the actual fast-check property with that seed/path.
- The replay fails with the same unexpected `not-found`. This is diagnostic reproduction, **not a Vitest gate run**.
- At failure: the target rule exists in raw Drive bytes; the outbox is empty; FIFO violations are empty; the target is not permanently refused; no compensating inverse was recorded.
- Calling the existing `refresh()` after failure makes the same rule ID visible in tab 1’s `rules()`.
- A shorter suffix also reproduces it after the unchanged mandatory spine: `send unknown t1 → change add t1 api → send refused t0 → undo idx16 t1 api`.
- No repository files were edited; final Git status is clean.

**Counterexample trace**

The mandatory spine leaves **16 model changes** (`undo-compensate.property.test.ts:520–536`).

| Command | Effect |
| --- | --- |
| `send permission t1` | Empty outbox; sets the simulated transport outcome. |
| `send refused t1` | Empty outbox; no new refusal. |
| `race idx11 t0 api` | Adds model change 16 and compensates it under the shared lock. The race implementation ignores its supplied index/api (`:398–413`). |
| `send unknown t1` | Empty outbox; sets the outcome inherited by the next add. |
| `change add t1 api` | Adds model change 17, “Keep category 29 together.” The create lands, but its response and read-back fail. The reserved outbox entry remains. |
| `send refused t0` | Retries the already-landed reserved ID. The fake returns duplicate-create conflict rather than permanently refusing an existing file (`:465–468`); write-once read-back confirms it. Tab 0 patches its listing and drains the outbox. |
| `undo idx17 t1 api` | Invokes the captured `removeRule(rule.id)` (`:199–201`, `:228–230`). Tab 1’s listing lacks the confirmed file, and the shared outbox no longer supplies it. Lookup fails before `retract`. |

The `refused` label on the penultimate command is misleading here: **the target is acknowledged successfully, not refused**.

**Five whys**

1. **Why does Undo fail?**  
   `removeRule()` cannot find the rule and throws `not-found` before consulting `Journal.retract`: [drive-vault.ts:1353](/private/tmp/bower-suites/src/data/vault/drive-vault.ts:1353).

2. **Why does lookup miss a persisted rule?**  
   `rules()` obtains rule records through `Journal.list()`, which combines the cached Drive listing with the current outbox: [drive-vault.ts:1331](/private/tmp/bower-suites/src/data/vault/drive-vault.ts:1331), [journal.ts:518](/private/tmp/bower-suites/src/data/vault/journal.ts:518), [journal.ts:535](/private/tmp/bower-suites/src/data/vault/journal.ts:535). Neither contains the target on tab 1 after acknowledgment.

3. **Why was tab 1’s listing never patched?**  
   Its original unknown send exits through the catch path. `reads.wrote()` and `place.wrote()` run only after confirmed success: [journal.ts:449](/private/tmp/bower-suites/src/data/vault/journal.ts:449), [journal.ts:454](/private/tmp/bower-suites/src/data/vault/journal.ts:454).

4. **Why does acknowledgment by tab 0 not repair tab 1?**  
   `place.wrote` patches only that `DriveVault` instance’s index: [drive-vault.ts:186](/private/tmp/bower-suites/src/data/vault/drive-vault.ts:186). The relay removes confirmed entries from shared storage: [journal.ts:421](/private/tmp/bower-suites/src/data/vault/journal.ts:421). The reader’s cached listing is retained: [drive-vault.ts:1472](/private/tmp/bower-suites/src/data/vault/drive-vault.ts:1472).

5. **Why does stale cache membership decide whether Undo is possible?**  
   `removeRule()` treats its first cached miss as authoritative absence. It has no bounded refresh/relookup before returning `not-found`. The existing refresh mechanism already corrects this: [drive-vault.ts:242](/private/tmp/bower-suites/src/data/vault/drive-vault.ts:242).

**Invariant and mechanism assessment**

- **Broken contract:** a successfully admitted rule remains removable after another tab acknowledges its previously unknown send. Cached absence incorrectly prevents the locked compensation decision.
- **FIFO:** intact; the relay confirms the original before removing its outbox entry. No later line passes it.
- **Person-state oracle:** its final assertions (`property.test.ts:301–308`) never execute. This failure demonstrates unavailable compensation, not an observed oracle mismatch or corrupted Drive content.
- **Model/test:** valid witness. The stored Undo closure targets the rule ID returned by the production add API; refreshing reveals that exact ID.
- **Permission/refusal paths:** preparatory labels, not the cause. The target’s permanent-refusal branch is never taken.
- **Cross-tab lock:** correctly serializes sending and retraction. Mutual exclusion does not refresh another instance’s listing.
- **Write-once:** correctly reconciles the lost response by reserved ID. No second reservation or compensation mechanism is needed.

**Standard solution and ownership**

Use **cache-aside revalidation**: a cached miss must be checked against the authoritative store before concluding that a previously returned entity disappeared. Independent local caches can become stale when another instance writes. Reference: [Microsoft’s Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside). This external reference was not fetched, respecting the no-network instruction.

The existing mechanism map assigns Drive read caching to `src/data/drive/` and compensating Undo to `Journal.retract`, with `ruleSequence` owning rule order: [ARCHITECTURE.md:88](/private/tmp/bower-suites/docs/ARCHITECTURE.md:88), [ARCHITECTURE.md:91](/private/tmp/bower-suites/docs/ARCHITECTURE.md:91).

The fix belongs at the existing **DriveVault listing freshness / rule lookup boundary**. Continue using `refresh`/`index`, `Journal.retract`, and the current inverse-record path. Preserve version-keyed content reads; this is missing listing metadata, not stale cached text.

**Fix options for the lead**

| Option | Trade-off |
| --- | --- |
| **1. Recommended: refresh once on a missing rule ID, then repeat lookup before returning `not-found`.** Extend `removeRule()` using the existing listing refresh path. | Small, bounded fix for this witness; adds a Drive listing only on a miss. Broader stale views can remain until refreshed. |
| **2. Revalidate the existing listing before journal-derived rule reads/removals.** Apply freshness through the existing `JournalPlace.files`/`DriveVault.index` boundary. | Addresses disappearing rule views as well as this action failure. More listing requests and latency; must avoid refresh/listener loops and preserve existing cached content reads. |

Neither option changes FIFO, reserved-ID reconciliation, or the locked retract decision. Do not accept `not-found` in the test or insert a test-only refresh.

**Fixed-seed reachability**

The unchanged pinned batches were checked through the same in-memory adapter: `427285`/30 runs, `427286`/50, and `427287`/50 all pass, consistent with the supplied Vitest log.

Their generated cases are deterministic. With the same generator and budgets, repeating those batches does not explore this missing interleaving. The command generator can express it; the random batch did. Explicit replay coverage is required.

**Regression red**

Add a separately named regression beside the existing property, retaining the mandatory spine, command generator, oracle, and assertions:

```ts
it('replays undo-compensate-counterexample', async () => {
  await fc.assert(property, {
    seed: 752195386,
    path: '49',
    numRuns: 1,
    endOnFailure: true,
  });
});
```

Current red: `not-found` rejected at `property.test.ts:244`. Required green: the existing API Undo reaches `retract`, records its compensating inverse, and completes FIFO, Drive-only oracle, and empty-outbox assertions.

```text
status: done; read-only diagnosis
worktree: /private/tmp/bower-suites
head: 78fda571c6102c85909533d409effd09dab40848
finding: product defect; stale listing blocks rule Undo after cross-tab acknowledgment
red: seed 752195386; path "49"; numRuns 1; unexpected not-found
checks: in-memory replay reproduced; pinned 30+50+50 pass; Vitest gates not run
sources: docs/ARCHITECTURE.md:88,91; Microsoft Cache-Aside pattern
left out: implementation and saved note; coordinator saves this diagnosis
```
